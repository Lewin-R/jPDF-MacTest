//! Merging whole PDF files into one new file (the builder's Merge page).
//!
//! The first document is the base: it keeps its catalog (outline, document
//! info, viewer preferences) and its page tree. Each further document's
//! objects are renumbered above the base's and moved in; its pages are
//! flattened (inherited attributes copied in) and appended as direct kids of
//! the base's root `/Pages` node. Its form fields join the base's
//! `/AcroForm`. What nothing references any more (the other catalogs, page
//! tree nodes, outlines) is pruned, and the result is written as a fresh,
//! full file: no incremental history of any input carries over.

use lopdf::{Dictionary, Document, Object, ObjectId};

use super::load_document;
use super::writer::{flattened_page, invalid, page_rotation};
use crate::error::AppError;

/// Merges the PDFs `files` (raw bytes) in order into one PDF; at least two.
pub fn merge_documents(files: &[Vec<u8>]) -> Result<Vec<u8>, AppError> {
    let docs = files
        .iter()
        .map(|b| load_document(b))
        .collect::<Result<Vec<_>, _>>()?;
    merge_loaded(docs)
}

/// `merge_documents` for documents already loaded (with `load_document`).
pub fn merge_loaded(docs: Vec<Document>) -> Result<Vec<u8>, AppError> {
    if docs.len() < 2 {
        return Err(AppError::InvalidPdf(
            "merging needs at least two PDFs".into(),
        ));
    }
    let mut docs = docs.into_iter();
    let mut base = docs.next().expect("checked above");
    let root = root_pages(&base)?;
    let mut kids = inline_array(&base, base.get_dictionary(root).map_err(invalid)?, b"Kids");
    let mut fields = Vec::new();

    for mut doc in docs {
        doc.renumber_objects_with(base.max_id + 1);
        let page_ids: Vec<ObjectId> = doc.page_iter().collect();
        let flat = page_ids
            .iter()
            .map(|&id| flattened_page(&doc, id, root, page_rotation(&doc, id)).map(|d| (id, d)))
            .collect::<Result<Vec<_>, _>>()?;
        fields.extend(form_fields(&doc));
        let top = doc.objects.keys().map(|id| id.0).max().unwrap_or(0);
        base.max_id = base.max_id.max(doc.max_id).max(top);
        base.objects.extend(std::mem::take(&mut doc.objects));
        for (id, dict) in flat {
            base.objects.insert(id, Object::Dictionary(dict));
            kids.push(Object::Reference(id));
        }
    }

    let count = count_pages(&base, &kids);
    let node = base.get_dictionary_mut(root).map_err(invalid)?;
    node.set("Kids", kids);
    node.set("Count", count);
    if !fields.is_empty() {
        add_form_fields(&mut base, fields)?;
    }

    // The other files' catalogs and page trees are unreachable now.
    base.prune_objects();
    base.trailer.remove(b"Prev");
    base.trailer.remove(b"XRefStm");
    let mut out = Vec::new();
    base.save_to(&mut out)
        .map_err(|e| AppError::Io(e.to_string()))?;
    Ok(out)
}

fn root_pages(doc: &Document) -> Result<ObjectId, AppError> {
    doc.catalog()
        .and_then(|c| c.get(b"Pages"))
        .and_then(Object::as_reference)
        .map_err(invalid)
}

/// `dict[key]` as an array (followed if indirect); empty when missing.
fn inline_array(doc: &Document, dict: &Dictionary, key: &[u8]) -> Vec<Object> {
    dict.get_deref(key, doc)
        .and_then(Object::as_array)
        .cloned()
        .unwrap_or_default()
}

/// Leaf pages under `kids` (a kid that is a `/Pages` node counts its `/Count`).
fn count_pages(doc: &Document, kids: &[Object]) -> i64 {
    kids.iter()
        .map(|k| {
            let d = k.as_reference().and_then(|id| doc.get_dictionary(id));
            match d {
                Ok(d) if d.has_type(b"Pages") => {
                    d.get(b"Count").and_then(Object::as_i64).unwrap_or(0)
                }
                _ => 1,
            }
        })
        .sum()
}

/// The document's `/AcroForm /Fields` entries.
fn form_fields(doc: &Document) -> Vec<Object> {
    let Ok(catalog) = doc.catalog() else {
        return Vec::new();
    };
    match catalog
        .get_deref(b"AcroForm", doc)
        .and_then(Object::as_dict)
    {
        Ok(form) => inline_array(doc, form, b"Fields"),
        Err(_) => Vec::new(),
    }
}

/// Appends `fields` to the base's `/AcroForm /Fields`, creating the form if needed.
fn add_form_fields(base: &mut Document, fields: Vec<Object>) -> Result<(), AppError> {
    let mut all = form_fields(base);
    all.extend(fields);
    let catalog = base.catalog().map_err(invalid)?;
    let form_ref = catalog.get(b"AcroForm").and_then(Object::as_reference).ok();
    match form_ref {
        Some(id) => base
            .get_dictionary_mut(id)
            .map_err(invalid)?
            .set("Fields", all),
        None => {
            let mut form = catalog
                .get(b"AcroForm")
                .and_then(Object::as_dict)
                .cloned()
                .unwrap_or_default();
            form.set("Fields", all);
            base.catalog_mut().map_err(invalid)?.set("AcroForm", form);
        }
    }
    Ok(())
}
