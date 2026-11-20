//! Exporting a copy of a PDF without annotations (the builder's Export menu).
//!
//! Every annotation is removed from the pages except links (`/Link`) and form
//! fields (`/Widget`): those belong to the document itself, and removing a
//! widget would break a fillable form. This covers annotations from any
//! program, not only JuliePDF's. What nothing references any more is pruned,
//! and the copy is written as a fresh, full file, so no earlier revision in it
//! still holds the removed annotations.
//!
//! Annotations the user flattened but has not saved yet are page content to
//! be: they are burned in first (as a save would), so the copy shows them.

use lopdf::{Document, Object, ObjectId};

use super::dto::{AnnotationDto, PageSpec};
use super::load_document;
use super::writer::{common_of, invalid, write_incremental_with_pages};
use crate::error::AppError;

/// `original` without annotations (see the module doc). `flattened` are
/// pending flattened annotations to burn into the pages (others in it are
/// ignored). With a page plan the copy has exactly those pages, in that order,
/// and `flattened` index the plan (see `write_incremental_with_pages`).
pub fn without_annotations(
    original: &[u8],
    flattened: &[AnnotationDto],
    pages: Option<&[PageSpec]>,
) -> Result<Vec<u8>, AppError> {
    let flattened: Vec<AnnotationDto> = flattened.iter().filter(|a| common_of(a).flattened).cloned().collect();
    let written;
    let bytes = if flattened.is_empty() && pages.is_none() {
        original
    } else {
        written = write_incremental_with_pages(original, &flattened, &[], pages)?.0;
        &written[..]
    };
    let mut doc = load_document(bytes)?;

    let page_ids: Vec<ObjectId> = doc.page_iter().collect();
    for id in page_ids {
        let page = doc.get_dictionary(id).map_err(invalid)?;
        let Ok(annots) = page.get_deref(b"Annots", &doc).and_then(Object::as_array) else {
            continue;
        };
        let kept: Vec<Object> = annots.iter().filter(|a| belongs_to_document(&doc, a)).cloned().collect();
        // Set on the page itself: an indirect `/Annots` array may be shared.
        let page = doc.get_dictionary_mut(id).map_err(invalid)?;
        if kept.is_empty() {
            page.remove(b"Annots");
        } else {
            page.set("Annots", kept);
        }
    }

    doc.prune_objects();
    doc.trailer.remove(b"Prev");
    doc.trailer.remove(b"XRefStm");
    let mut out = Vec::new();
    doc.save_to(&mut out).map_err(|e| AppError::Io(e.to_string()))?;
    Ok(out)
}

/// A link or a form field (kept); anything else on `/Annots` is an annotation to drop.
fn belongs_to_document(doc: &Document, annot: &Object) -> bool {
    let dict = match annot {
        Object::Reference(id) => doc.get_dictionary(*id),
        other => other.as_dict(),
    };
    dict.ok()
        .and_then(|d| d.get_deref(b"Subtype", doc).ok())
        .and_then(|s| s.as_name().ok())
        .is_some_and(|n| n == b"Link" || n == b"Widget")
}
