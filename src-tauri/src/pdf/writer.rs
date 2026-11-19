//! Incremental-update writer: the original bytes stay an exact prefix; changed and
//! new objects, a new cross-reference section (table or stream, matching the
//! original) and a trailer with `/Prev` are appended.
use std::collections::HashMap;

use lopdf::{
    Dictionary, Document, IncrementalDocument, Object, ObjectId, Stream, StringFormat, dictionary,
    text_string,
};

use super::appearance::{Appearance, freetext_appearance, highlight_appearance, ink_appearance};
use super::date::pdf_date;
use super::dto::{AnnotationDto, Background, Blend, Common, DeleteRef, InkRole};
use super::fmt::fmt_num;
use super::{annotation_nm, format_source_ref, load_document, nm_owners, parse_source_ref};
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
    /// `nm_owners` of the original document, computed on first use.
    owners: Option<HashMap<String, ObjectId>>,
}

/// Returns the new file bytes and `id → sourceRef` for every written annotation.
pub fn write_incremental(
    original: &[u8],
    upserts: &[AnnotationDto],
    deletes: &[DeleteRef],
) -> Result<(Vec<u8>, HashMap<String, String>), AppError> {
    let doc = load_document(original)?;
    let mut w = Writer::new(original, doc);
    let mut refs = HashMap::new();
    for dto in upserts {
        if let Some((id, source_ref)) = w.upsert(dto)? {
            refs.insert(id, source_ref);
        }
    }
    for d in deletes {
        // A ref that now names another annotation (the file changed since it
        // was loaded) is left alone, like upserts.
        if let Some(id) = parse_source_ref(&d.source_ref)
            && w.is_same_annotation(id, &d.id)
        {
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
            owners: None,
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

    /// Whether the object at `id` is the annotation `dto_id` was read as. An
    /// object whose `/NM` names another annotation is not (the file changed
    /// since it was loaded), unless the reader gave it a fresh id because an
    /// earlier object carries the same `/NM`. Without `/NM` there is nothing
    /// to check against.
    fn is_same_annotation(&mut self, id: ObjectId, dto_id: &str) -> bool {
        let prev = self.inc.get_prev_documents();
        let Some(nm) = prev.get_dictionary(id).ok().and_then(|d| annotation_nm(prev, d)) else {
            return true;
        };
        if nm == dto_id {
            return true;
        }
        let owners = self.owners.get_or_insert_with(|| nm_owners(prev));
        owners.get(&nm) != Some(&id)
    }

    fn upsert(&mut self, dto: &AnnotationDto) -> Result<Option<(String, String)>, AppError> {
        let common = common_of(dto);
        let page_id = *self
            .pages
            .get(common.page as usize)
            .ok_or_else(|| AppError::InvalidPdf(format!("page {} out of range", common.page)))?;
        let existing = self
            .existing(common.source_ref.as_deref())
            .filter(|&id| self.is_same_annotation(id, &common.id));

        let rotation = page_rotation(self.prev(), page_id);
        let Some((mut annot, ap)) = build_annotation(dto, rotation)? else {
            // Nothing to draw (e.g. every stroke erased): drop any saved version.
            if let Some(id) = existing {
                self.detach(id);
            }
            return Ok(None);
        };
        let ap_id = self.inc.new_document.add_object(appearance_stream(&ap)?);
        annot.set("Rect", nums(&ap.rect()));
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
                if matches!(dto, AnnotationDto::Freetext { .. }) {
                    // Rich text, callout and intent of the old version would
                    // make other viewers show stale text or a callout line.
                    for key in [b"RC".as_slice(), b"RD", b"CL", b"IT"] {
                        merged.remove(key);
                    }
                }
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
/// `page_rotation` is the page's `/Rotate` (FreeText text is turned upright on screen).
fn build_annotation(
    dto: &AnnotationDto,
    page_rotation: i32,
) -> Result<Option<(Dictionary, Appearance)>, AppError> {
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
        AnnotationDto::Freetext {
            rect,
            text,
            lines,
            font_size,
            text_color,
            background,
            ..
        } => {
            check_finite(
                rect.iter()
                    .chain(text_color)
                    .chain([font_size])
                    .chain(background.iter().flat_map(|b| b.color.iter().chain([&b.opacity]))),
            )?;
            if text.trim().is_empty() {
                return Ok(None);
            }
            // The TS side wraps; a DTO without lines falls back to the hard breaks.
            let fallback: Vec<String>;
            let lines = if lines.is_empty() {
                fallback = text.split('\n').map(|l| l.trim_end_matches('\r').to_string()).collect();
                &fallback
            } else {
                lines
            };
            let ap = freetext_appearance(
                *rect,
                lines,
                *font_size,
                *text_color,
                background.as_ref(),
                page_rotation,
            );
            Ok(Some((freetext_dict(text, *font_size, *text_color, background.as_ref()), ap)))
        }
    }
}

/// `/C` is the background colour; an empty array (transparent) when there is
/// none, so an update also clears the colour of a previously saved version.
/// `/CA` stays 1: the background opacity lives in the appearance's `GS0` (fill
/// only), and `/CA` would also fade the text. `/JuliePDF` keeps the font size,
/// text colour and background opacity at full real precision for the reader
/// (`/DA` numbers are rounded to 3 decimals).
fn freetext_dict(text: &str, font_size: f64, color: [f64; 3], bg: Option<&Background>) -> Dictionary {
    let da = format!(
        "/Helv {} Tf {} {} {} rg",
        fmt_num(font_size),
        fmt_num(color[0]),
        fmt_num(color[1]),
        fmt_num(color[2])
    );
    let hex = |v: f64| (v.clamp(0.0, 1.0) * 255.0).round() as u8;
    let ds = format!(
        "font: Helvetica,sans-serif {}pt; color: #{:02X}{:02X}{:02X}",
        fmt_num(font_size),
        hex(color[0]),
        hex(color[1]),
        hex(color[2])
    );
    dictionary! {
        "Subtype" => "FreeText",
        "Contents" => text_string(text),
        "DA" => Object::String(da.into_bytes(), StringFormat::Literal),
        "DS" => Object::String(ds.into_bytes(), StringFormat::Literal),
        "C" => bg.map_or(Object::Array(Vec::new()), |b| nums(&b.color)),
        "CA" => 1,
        "BS" => dictionary! { "W" => 0 },
        "JuliePDF" => dictionary! {
            "v" => 1,
            "fontSize" => num(font_size),
            "textColor" => nums(&color),
            "hasBg" => bg.is_some(),
            "bgOpacity" => num(bg.map_or(1.0, |b| b.opacity)),
        },
    }
}

/// The page's `/Rotate` (inherited through `/Parent`), normalised to 0..360;
/// 0 when absent or not a multiple of 90.
fn page_rotation(doc: &Document, page_id: ObjectId) -> i32 {
    let mut node = doc.get_dictionary(page_id).ok();
    // Bounded walk: a malformed /Parent cycle must not hang the save.
    for _ in 0..64 {
        let Some(d) = node else { break };
        if let Ok(r) = d.get_deref(b"Rotate", doc).and_then(Object::as_i64) {
            let r = r.rem_euclid(360) as i32;
            return if r % 90 == 0 { r } else { 0 };
        }
        node = d.get_deref(b"Parent", doc).and_then(Object::as_dict).ok();
    }
    0
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
    compressed_stream(dict, &ap.content)
}

/// A Flate-compressed stream (uncompressed if that is not smaller). Uses the
/// fast level: lopdf's `Stream::compress` uses the best level, which costs
/// about 0.25 ms per pen-stroke appearance for a few percent of size.
fn compressed_stream(mut dict: Dictionary, content: &[u8]) -> Result<Stream, AppError> {
    use flate2::{Compression, write::ZlibEncoder};
    use std::io::Write;
    let mut enc = ZlibEncoder::new(Vec::with_capacity(content.len() / 2), Compression::fast());
    enc.write_all(content).map_err(|e| AppError::Io(e.to_string()))?;
    let packed = enc.finish().map_err(|e| AppError::Io(e.to_string()))?;
    if packed.len() < content.len() {
        dict.set("Filter", "FlateDecode");
        Ok(Stream::new(dict, packed))
    } else {
        Ok(Stream::new(dict, content.to_vec()))
    }
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
