//! Incremental-update writer: the original bytes stay an exact prefix; changed and
//! new objects, a new cross-reference section (table or stream, matching the
//! original) and a trailer with `/Prev` are appended.
use std::collections::HashMap;

use lopdf::{
    Dictionary, Document, IncrementalDocument, Object, ObjectId, Stream, StringFormat, dictionary,
    text_string,
};

use super::appearance::{Appearance, highlight_appearance, ink_appearance};
use super::date::pdf_date;
use super::dto::{AnnotationDto, Blend, Common, InkRole};
use super::{format_source_ref, load_document, parse_source_ref};
use crate::error::AppError;

/// Where a page's `/Annots` array lives.
enum AnnotsHome {
    /// Inline in the page dictionary, or absent: the page object is revised.
    Page,
    /// An indirect array object: only that object is revised.
    Indirect(ObjectId),
}

struct PageAnnots {
    items: Vec<Object>,
    home: AnnotsHome,
    dirty: bool,
}

struct Writer {
    inc: IncrementalDocument,
    pages: Vec<ObjectId>,
    annots: HashMap<ObjectId, PageAnnots>,
}

/// Returns the new file bytes and `id → sourceRef` for every written annotation.
pub fn write_incremental(
    original: &[u8],
    upserts: &[AnnotationDto],
    deletes: &[String],
) -> Result<(Vec<u8>, HashMap<String, String>), AppError> {
    let doc = load_document(original)?;
    let mut w = Writer::new(original, doc);
    let mut refs = HashMap::new();
    for dto in upserts {
        if let Some((id, source_ref)) = w.upsert(dto)? {
            refs.insert(id, source_ref);
        }
    }
    for r in deletes {
        if let Some(id) = parse_source_ref(r) {
            w.detach(id);
        }
    }
    Ok((w.finish()?, refs))
}

impl Writer {
    fn new(original: &[u8], doc: Document) -> Self {
        let pages: Vec<ObjectId> = doc.page_iter().collect();
        // Never reuse object numbers below the original /Size (free entries included).
        let size = doc
            .trailer
            .get(b"Size")
            .and_then(Object::as_i64)
            .unwrap_or(0);
        let max_id = doc.max_id.max(u32::try_from(size - 1).unwrap_or(0));
        let mut trailer = dictionary! {};
        for key in [b"Root".as_slice(), b"Info", b"ID"] {
            if let Ok(v) = doc.trailer.get(key) {
                trailer.set(key, v.clone());
            }
        }
        let prev_start = doc.xref_start;
        let mut inc = IncrementalDocument::create_from(original.to_vec(), doc);
        // A fresh trailer: an xref-stream dictionary from the original would carry
        // /W, /Index, /Filter, /DecodeParms that do not describe the new section,
        // and a hybrid file's /XRefStm must not shadow the /Prev chain.
        if prev_start != 0 {
            trailer.set("Prev", prev_start as i64);
        }
        inc.new_document.trailer = trailer;
        inc.new_document.max_id = max_id;
        Writer {
            inc,
            pages,
            annots: HashMap::new(),
        }
    }

    fn prev(&self) -> &Document {
        self.inc.get_prev_documents()
    }

    /// Current `/Annots` of a page, loaded once and then edited in memory.
    fn page_annots(&mut self, page_id: ObjectId) -> &mut PageAnnots {
        if !self.annots.contains_key(&page_id) {
            let prev = self.inc.get_prev_documents();
            let page = prev.get_dictionary(page_id).ok();
            let entry = match page.and_then(|p| p.get(b"Annots").ok()) {
                Some(Object::Reference(arr_id)) => PageAnnots {
                    items: prev
                        .get_object(*arr_id)
                        .and_then(Object::as_array)
                        .cloned()
                        .unwrap_or_default(),
                    home: AnnotsHome::Indirect(*arr_id),
                    dirty: false,
                },
                Some(Object::Array(items)) => PageAnnots {
                    items: items.clone(),
                    home: AnnotsHome::Page,
                    dirty: false,
                },
                _ => PageAnnots {
                    items: Vec::new(),
                    home: AnnotsHome::Page,
                    dirty: false,
                },
            };
            self.annots.insert(page_id, entry);
        }
        self.annots.get_mut(&page_id).expect("inserted above")
    }

    fn page_containing(&mut self, id: ObjectId) -> Option<ObjectId> {
        let pages = self.pages.clone();
        pages
            .into_iter()
            .find(|&p| self.page_annots(p).items.contains(&Object::Reference(id)))
    }

    /// Removes the reference from whichever page lists it; unknown refs are ignored.
    fn detach(&mut self, id: ObjectId) {
        if let Some(page) = self.page_containing(id) {
            let a = self.page_annots(page);
            a.items.retain(|o| *o != Object::Reference(id));
            a.dirty = true;
        }
    }

    fn attach(&mut self, page: ObjectId, id: ObjectId) {
        let a = self.page_annots(page);
        if !a.items.contains(&Object::Reference(id)) {
            a.items.push(Object::Reference(id));
            a.dirty = true;
        }
    }

    /// The annotation the source ref points to, if some page still lists it in
    /// `/Annots` (so a stale or bogus ref can never overwrite a non-annotation object).
    fn existing(&mut self, source_ref: Option<&str>) -> Option<ObjectId> {
        let id = parse_source_ref(source_ref?)?;
        self.prev().get_dictionary(id).ok()?;
        self.page_containing(id).map(|_| id)
    }

    fn upsert(&mut self, dto: &AnnotationDto) -> Result<Option<(String, String)>, AppError> {
        let common = common_of(dto);
        let page_id = *self
            .pages
            .get(common.page as usize)
            .ok_or_else(|| AppError::InvalidPdf(format!("page {} out of range", common.page)))?;
        let existing = self.existing(common.source_ref.as_deref());

        let Some((mut annot, ap)) = build_annotation(dto)? else {
            // Nothing to draw (e.g. every stroke erased): drop any saved version.
            if let Some(id) = existing {
                self.detach(id);
            }
            return Ok(None);
        };
        let ap_id = self.inc.new_document.add_object(appearance_stream(&ap)?);
        annot.set("Rect", nums(&ap.bbox));
        annot.set("AP", dictionary! { "N" => ap_id });
        annot.set("P", page_id);
        common_entries(&mut annot, common);

        let id = match existing {
            Some(id) => {
                if self.page_containing(id) != Some(page_id) {
                    self.detach(id);
                }
                // Keep keys JuliePDF does not own (/Contents, /Popup, /RC,
                // /CreationDate, /StructParent, …): overwrite only ours.
                let mut merged = self.prev().get_dictionary(id).cloned().unwrap_or_default();
                for (k, v) in annot {
                    merged.set(k, v);
                }
                self.inc.new_document.set_object(id, merged);
                id
            }
            None => self.inc.new_document.add_object(annot),
        };
        self.attach(page_id, id);
        Ok(Some((common.id.clone(), format_source_ref(id))))
    }

    fn finish(mut self) -> Result<Vec<u8>, AppError> {
        for (page_id, a) in std::mem::take(&mut self.annots) {
            if !a.dirty {
                continue;
            }
            match a.home {
                AnnotsHome::Indirect(arr_id) => self
                    .inc
                    .new_document
                    .set_object(arr_id, Object::Array(a.items)),
                AnnotsHome::Page => {
                    self.inc
                        .opt_clone_object_to_new_document(page_id)
                        .map_err(invalid)?;
                    let page = self
                        .inc
                        .new_document
                        .get_dictionary_mut(page_id)
                        .map_err(invalid)?;
                    page.set("Annots", Object::Array(a.items));
                }
            }
        }
        let mut out = Vec::new();
        self.inc
            .save_to(&mut out)
            .map_err(|e| AppError::Io(e.to_string()))?;
        Ok(out)
    }
}

fn invalid(e: lopdf::Error) -> AppError {
    AppError::InvalidPdf(e.to_string())
}

fn common_of(dto: &AnnotationDto) -> &Common {
    match dto {
        AnnotationDto::Ink { common, .. }
        | AnnotationDto::Highlight { common, .. }
        | AnnotationDto::Freetext { common, .. } => common,
    }
}

/// Subtype-specific keys plus the appearance. `None` = nothing to draw.
/// Every key set here (and in `upsert`/`common_entries`) is owned by JuliePDF:
/// updating an existing annotation overwrites exactly these and keeps the rest.
/// Adding a kind = one match arm calling its appearance builder.
fn build_annotation(dto: &AnnotationDto) -> Result<Option<(Dictionary, Appearance)>, AppError> {
    match dto {
        AnnotationDto::Ink {
            strokes,
            color,
            width,
            opacity,
            blend,
            role,
            ..
        } => {
            check_finite(
                strokes
                    .iter()
                    .flatten()
                    .flatten()
                    .chain(color)
                    .chain([width, opacity]),
            )?;
            if strokes.iter().all(|s| s.is_empty()) {
                return Ok(None);
            }
            let ap = ink_appearance(strokes, *color, *width, *opacity, *blend == Blend::Multiply);
            let ink_list: Vec<Object> = strokes
                .iter()
                .filter(|s| !s.is_empty())
                .map(|s| Object::Array(s.iter().flat_map(|p| [num(p[0]), num(p[1])]).collect()))
                .collect();
            let role = match role {
                InkRole::Pen => "pen",
                InkRole::Marker => "marker",
            };
            let d = dictionary! {
                "Subtype" => "Ink",
                "C" => nums(color),
                "CA" => num(*opacity),
                "InkList" => ink_list,
                "BS" => dictionary! { "W" => num(*width), "S" => "S" },
                "JuliePDF" => dictionary! { "v" => 1, "role" => role, "blend" => blend_name(*blend) },
            };
            Ok(Some((d, ap)))
        }
        AnnotationDto::Highlight {
            quads,
            color,
            opacity,
            ..
        } => {
            check_finite(quads.iter().flatten().chain(color).chain([opacity]))?;
            if quads.is_empty() {
                return Ok(None);
            }
            let ap = highlight_appearance(quads, *color, *opacity);
            let d = dictionary! {
                "Subtype" => "Highlight",
                "C" => nums(color),
                "CA" => num(*opacity),
                "QuadPoints" => nums(&quads.concat()),
                "JuliePDF" => dictionary! { "v" => 1 },
            };
            Ok(Some((d, ap)))
        }
        AnnotationDto::Freetext { .. } => Err(unsupported("freetext")),
    }
}

fn unsupported(kind: &str) -> AppError {
    AppError::InvalidPdf(format!("unsupported annotation kind: {kind}"))
}

fn blend_name(b: Blend) -> &'static str {
    match b {
        Blend::Normal => "normal",
        Blend::Multiply => "multiply",
    }
}

fn check_finite<'a>(values: impl IntoIterator<Item = &'a f64>) -> Result<(), AppError> {
    if values.into_iter().all(|v| v.is_finite()) {
        Ok(())
    } else {
        Err(AppError::InvalidPdf(
            "annotation contains a non-finite number".into(),
        ))
    }
}

fn common_entries(d: &mut Dictionary, c: &Common) {
    d.set("Type", "Annot");
    d.set("NM", text_string(&c.id));
    d.set(
        "M",
        Object::String(pdf_date(&c.modified_at).into_bytes(), StringFormat::Literal),
    );
    let author = if c.author.is_empty() { "JuliePDF" } else { &c.author };
    d.set("T", text_string(author));
    d.set("F", 4);
}

fn num(v: f64) -> Object {
    if v.fract() == 0.0 && v.abs() < 1e15 {
        Object::Integer(v as i64)
    } else {
        Object::Real(v as f32)
    }
}

fn nums(values: &[f64]) -> Object {
    Object::Array(values.iter().map(|&v| num(v)).collect())
}

/// Form XObject for an appearance whose content uses absolute user-space coordinates.
fn appearance_stream(ap: &Appearance) -> Result<Stream, AppError> {
    let mut gs =
        dictionary! { "Type" => "ExtGState", "CA" => num(ap.opacity), "ca" => num(ap.opacity) };
    if ap.multiply {
        gs.set("BM", "Multiply");
    }
    let mut resources = dictionary! { "ExtGState" => dictionary! { "GS0" => gs } };
    if ap.uses_helvetica {
        resources.set(
            "Font",
            dictionary! {
                "Helv" => dictionary! {
                    "Type" => "Font",
                    "Subtype" => "Type1",
                    "BaseFont" => "Helvetica",
                    "Encoding" => "WinAnsiEncoding",
                },
            },
        );
    }
    let matrix = ap.matrix.unwrap_or([1.0, 0.0, 0.0, 1.0, 0.0, 0.0]);
    let dict = dictionary! {
        "Type" => "XObject",
        "Subtype" => "Form",
        "FormType" => 1,
        "BBox" => nums(&ap.bbox),
        "Matrix" => nums(&matrix),
        "Resources" => resources,
    };
    let mut stream = Stream::new(dict, ap.content.clone());
    stream.compress().map_err(|e| AppError::Io(e.to_string()))?;
    Ok(stream)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn numbers_are_integers_when_whole() {
        assert_eq!(num(4.0), Object::Integer(4));
        assert_eq!(num(0.5), Object::Real(0.5));
    }
}
