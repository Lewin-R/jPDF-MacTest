//! Merging whole PDF files into one (the builder's Merge page).
#[allow(dead_code)]
mod fixtures;

use juliepdf_lib::commands::files::merge_to_path;
use juliepdf_lib::error::AppError;
use juliepdf_lib::pdf::dto::AnnotationDto;
use juliepdf_lib::pdf::merge::merge_documents;
use juliepdf_lib::pdf::reader::read_annotations;
use lopdf::{Dictionary, Document, Object, ObjectId};

fn load(bytes: &[u8]) -> Document {
    Document::load_mem(bytes).unwrap()
}

fn pages(doc: &Document) -> Vec<ObjectId> {
    doc.page_iter().collect()
}

fn page(doc: &Document, id: ObjectId) -> &Dictionary {
    doc.get_dictionary(id).unwrap()
}

/// The "Page N" line each page draws, in page order.
fn page_labels(doc: &Document) -> Vec<String> {
    pages(doc)
        .into_iter()
        .map(|id| {
            let content = String::from_utf8_lossy(&doc.get_page_content(id)).into_owned();
            let start = content.find("(Page ").expect("page label") + 1;
            let end = start + content[start..].find(')').unwrap();
            content[start..end].to_string()
        })
        .collect()
}

fn nums(o: &Object) -> Vec<f32> {
    o.as_array()
        .unwrap()
        .iter()
        .map(|v| v.as_float().unwrap())
        .collect()
}

#[test]
fn page_order_and_count() {
    let out = merge_documents(&[fixtures::simple_pdf(2), fixtures::simple_pdf(3)]).unwrap();
    let doc = load(&out);
    assert_eq!(
        page_labels(&doc),
        ["Page 1", "Page 2", "Page 1", "Page 2", "Page 3"]
    );
    let root = doc
        .catalog()
        .unwrap()
        .get(b"Pages")
        .unwrap()
        .as_reference()
        .unwrap();
    assert_eq!(page(&doc, root).get(b"Count").unwrap().as_i64().unwrap(), 5);
}

#[test]
fn three_files_keep_their_order() {
    let out = merge_documents(&[
        fixtures::simple_pdf(1),
        fixtures::rotated_pdf(),
        fixtures::simple_pdf(2),
    ])
    .unwrap();
    let doc = load(&out);
    assert_eq!(page_labels(&doc), ["Page 1", "Page 1", "Page 1", "Page 2"]);
    let ids = pages(&doc);
    assert_eq!(
        page(&doc, ids[1]).get(b"Rotate").unwrap().as_i64().unwrap(),
        90
    );
    assert_eq!(
        page(&doc, ids[2]).get(b"Rotate").unwrap().as_i64().unwrap(),
        0
    );
}

#[test]
fn appended_pages_keep_inherited_attributes() {
    let out = merge_documents(&[fixtures::simple_pdf(1), fixtures::nested_pages_pdf()]).unwrap();
    let doc = load(&out);
    let ids = pages(&doc);
    assert_eq!(ids.len(), 4);
    for &id in &ids[1..] {
        let p = page(&doc, id);
        assert_eq!(nums(p.get(b"MediaBox").unwrap()), [0.0, 0.0, 400.0, 600.0]);
        assert_eq!(p.get(b"Rotate").unwrap().as_i64().unwrap(), 90);
        assert!(p.get_deref(b"Resources", &doc).unwrap().as_dict().is_ok());
    }
    // The base's own pages are untouched: still A4 through the root node.
    assert!(page(&doc, ids[0]).get(b"MediaBox").is_err());
}

#[test]
fn inherited_cropbox_is_copied() {
    let out =
        merge_documents(&[fixtures::simple_pdf(1), fixtures::inherited_cropbox_pdf()]).unwrap();
    let doc = load(&out);
    let ids = pages(&doc);
    assert_eq!(
        nums(page(&doc, ids[1]).get(b"CropBox").unwrap()),
        [20.0, 20.0, 400.0, 600.0]
    );
}

#[test]
fn annotations_survive() {
    let out =
        merge_documents(&[fixtures::simple_pdf(2), fixtures::pdf_with_foreign_annots()]).unwrap();
    let inks: Vec<u32> = read_annotations(&out)
        .unwrap()
        .into_iter()
        .filter_map(|a| match a {
            AnnotationDto::Ink { common, .. } => Some(common.page),
            _ => None,
        })
        .collect();
    assert_eq!(inks, [2]);
    // The link's /P points at its (renumbered) page.
    let doc = load(&out);
    let third = pages(&doc)[2];
    let annots = page(&doc, third)
        .get(b"Annots")
        .unwrap()
        .as_array()
        .unwrap();
    let link = annots
        .iter()
        .map(|o| doc.get_dictionary(o.as_reference().unwrap()).unwrap())
        .find(|d| d.get(b"Subtype").unwrap().as_name().unwrap() == b"Link")
        .unwrap();
    assert_eq!(link.get(b"P").unwrap().as_reference().unwrap(), third);
}

#[test]
fn form_fields_are_merged() {
    let out =
        merge_documents(&[fixtures::form_pdf("first"), fixtures::form_pdf("second")]).unwrap();
    let doc = load(&out);
    let form = doc
        .catalog()
        .unwrap()
        .get_deref(b"AcroForm", &doc)
        .unwrap()
        .as_dict()
        .unwrap();
    let names: Vec<String> = form
        .get(b"Fields")
        .unwrap()
        .as_array()
        .unwrap()
        .iter()
        .map(|o| {
            let d = doc.get_dictionary(o.as_reference().unwrap()).unwrap();
            String::from_utf8(d.get(b"T").unwrap().as_str().unwrap().to_vec()).unwrap()
        })
        .collect();
    assert_eq!(names, ["first", "second"]);
}

#[test]
fn form_fields_of_a_later_file_create_the_form() {
    let out = merge_documents(&[fixtures::simple_pdf(1), fixtures::form_pdf("only")]).unwrap();
    let doc = load(&out);
    let form = doc
        .catalog()
        .unwrap()
        .get_deref(b"AcroForm", &doc)
        .unwrap()
        .as_dict()
        .unwrap();
    assert_eq!(form.get(b"Fields").unwrap().as_array().unwrap().len(), 1);
}

#[test]
fn xref_stream_input() {
    let out = merge_documents(&[fixtures::xref_stream_pdf(), fixtures::xref_stream_pdf()]).unwrap();
    assert_eq!(
        page_labels(&load(&out)),
        ["Page 1", "Page 2", "Page 1", "Page 2"]
    );
}

#[test]
fn same_file_twice() {
    let a = fixtures::simple_pdf(2);
    let out = merge_documents(&[a.clone(), a]).unwrap();
    let doc = load(&out);
    let ids = pages(&doc);
    assert_eq!(ids.len(), 4);
    // Every page is its own object.
    let unique: std::collections::HashSet<_> = ids.iter().collect();
    assert_eq!(unique.len(), 4);
}

#[test]
fn other_files_catalogs_are_dropped() {
    let out = merge_documents(&[fixtures::simple_pdf(1), fixtures::simple_pdf(1)]).unwrap();
    let doc = load(&out);
    let catalogs = doc
        .objects
        .values()
        .filter(|o| o.as_dict().is_ok_and(|d| d.has_type(b"Catalog")))
        .count();
    assert_eq!(catalogs, 1);
}

#[test]
fn encrypted_input_refused() {
    let err = merge_documents(&[fixtures::simple_pdf(1), fixtures::encrypted_pdf()]).unwrap_err();
    assert!(matches!(err, AppError::Encrypted(_)), "{err:?}");
}

#[test]
fn fewer_than_two_files_refused() {
    assert!(merge_documents(&[fixtures::simple_pdf(1)]).is_err());
    assert!(merge_documents(&[]).is_err());
}

#[test]
fn errors_name_the_file() {
    let dir = tempfile::tempdir().unwrap();
    let good = dir.path().join("good.pdf");
    let bad = dir.path().join("broken.pdf");
    std::fs::write(&good, fixtures::simple_pdf(1)).unwrap();
    std::fs::write(&bad, b"not a pdf").unwrap();
    let target = dir.path().join("out.pdf");
    let err = merge_to_path(&[good.as_path(), bad.as_path()], &target).unwrap_err();
    assert!(
        matches!(&err, AppError::InvalidPdf(m) if m.contains("broken.pdf")),
        "{err:?}"
    );
    assert!(!target.exists());
}

#[test]
fn target_may_be_an_input() {
    let dir = tempfile::tempdir().unwrap();
    let a = dir.path().join("a.pdf");
    let b = dir.path().join("b.pdf");
    std::fs::write(&a, fixtures::simple_pdf(1)).unwrap();
    std::fs::write(&b, fixtures::simple_pdf(2)).unwrap();
    merge_to_path(&[a.as_path(), b.as_path()], &a).unwrap();
    assert_eq!(
        page_labels(&load(&std::fs::read(&a).unwrap())),
        ["Page 1", "Page 1", "Page 2"]
    );
}
