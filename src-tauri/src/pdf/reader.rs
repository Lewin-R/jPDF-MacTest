//! Maps a document's `/Ink`, `/Highlight` and `/FreeText` annotations to DTOs.
//! `/JuliePDF` values win; foreign annotations get defaults. Other subtypes (and
//! annotations stored inline in `/Annots`, which cannot be addressed by ref) are
//! display-only and skipped.
use lopdf::{Dictionary, Document, Object, decode_text_string};

use super::date::iso_from_pdf_date;
use super::dto::{AnnotationDto, Background, Blend, Common, InkRole};
use super::{format_source_ref, load_document};
use crate::error::AppError;

const BLACK: [f64; 3] = [0.0; 3];

pub fn read_annotations(bytes: &[u8]) -> Result<Vec<AnnotationDto>, AppError> {
    let doc = load_document(bytes)?;
    let mut out = Vec::new();
    for (index, page_id) in doc.page_iter().enumerate() {
        let Ok(page) = doc.get_dictionary(page_id) else {
            continue;
        };
        let Ok(annots) = page.get_deref(b"Annots", &doc).and_then(Object::as_array) else {
            continue;
        };
        for item in annots {
            let Ok(id) = item.as_reference() else {
                continue;
            };
            let Ok(d) = doc.get_dictionary(id) else {
                continue;
            };
            let common = Common {
                id: text(&doc, d, b"NM")
                    .filter(|s| !s.is_empty())
                    .unwrap_or_else(|| uuid::Uuid::new_v4().to_string()),
                page: index as u32,
                source_ref: Some(format_source_ref(id)),
                modified_at: text(&doc, d, b"M")
                    .and_then(|m| iso_from_pdf_date(&m))
                    .unwrap_or_default(),
                author: text(&doc, d, b"T").unwrap_or_default(),
            };
            if let Some(dto) = map_annotation(&doc, d, common) {
                out.push(dto);
            }
        }
    }
    Ok(out)
}

fn map_annotation(doc: &Document, d: &Dictionary, common: Common) -> Option<AnnotationDto> {
    let subtype = deref(doc, d.get(b"Subtype").ok()?).as_name().ok()?;
    let private = d.get_deref(b"JuliePDF", doc).and_then(Object::as_dict).ok();
    let private_name =
        |key: &[u8]| private.and_then(|p| p.get_deref(key, doc).and_then(Object::as_name).ok());
    let color = color_of(doc, d.get(b"C").ok()).unwrap_or(BLACK);
    let opacity = number(doc, d.get(b"CA").ok()).unwrap_or(1.0);
    match subtype {
        b"Ink" => {
            let strokes = d
                .get_deref(b"InkList", doc)
                .and_then(Object::as_array)
                .map(|list| list.iter().map(|s| points(doc, s)).collect())
                .unwrap_or_default();
            let width = d
                .get_deref(b"BS", doc)
                .and_then(Object::as_dict)
                .ok()
                .and_then(|bs| number(doc, bs.get(b"W").ok()))
                .unwrap_or(1.0);
            let role = match private_name(b"role") {
                Some(b"marker") => InkRole::Marker,
                _ => InkRole::Pen,
            };
            let blend = match private_name(b"blend") {
                Some(b"multiply") => Blend::Multiply,
                _ => Blend::Normal,
            };
            Some(AnnotationDto::Ink {
                common,
                strokes,
                color,
                width,
                opacity,
                blend,
                role,
            })
        }
        b"Highlight" => {
            let flat = numbers(doc, d.get(b"QuadPoints").ok());
            let quads = flat.as_chunks::<8>().0.to_vec();
            Some(AnnotationDto::Highlight {
                common,
                quads,
                color,
                opacity,
            })
        }
        b"FreeText" => {
            let r = numbers(doc, d.get(b"Rect").ok());
            let rect = if r.len() == 4 {
                [
                    r[0].min(r[2]),
                    r[1].min(r[3]),
                    r[0].max(r[2]),
                    r[1].max(r[3]),
                ]
            } else {
                [0.0; 4]
            };
            let (da_size, da_color) = parse_da(&text(doc, d, b"DA").unwrap_or_default());
            let c = color_of(doc, d.get(b"C").ok());
            // JuliePDF keeps /CA at 1 and font size, text colour and background
            // opacity in /JuliePDF (exact, unlike the rounded /DA).
            let private_num = |key: &[u8]| private.and_then(|p| number(doc, p.get(key).ok()));
            let private_bool =
                |key: &[u8]| private.and_then(|p| p.get_deref(key, doc).and_then(Object::as_bool).ok());
            let font_size = private_num(b"fontSize").filter(|s| *s > 0.0).unwrap_or(da_size);
            let text_color = private
                .and_then(|p| components_to_rgb(&numbers(doc, p.get(b"textColor").ok())))
                .map(snap_rgb)
                .unwrap_or(da_color);
            let background = match private_bool(b"hasBg") {
                Some(false) => None,
                // A background without a colour cannot be drawn: none.
                Some(true) => c.map(|color| Background {
                    color: snap_rgb(color),
                    opacity: private_num(b"bgOpacity").unwrap_or(1.0),
                }),
                None => c.map(|color| Background { color, opacity }),
            };
            Some(AnnotationDto::Freetext {
                common,
                rect,
                text: text(doc, d, b"Contents").unwrap_or_default(),
                lines: Vec::new(),
                font_size,
                text_color,
                background,
            })
        }
        _ => None,
    }
}

fn deref<'a>(doc: &'a Document, o: &'a Object) -> &'a Object {
    doc.dereference(o).map(|(_, o)| o).unwrap_or(o)
}

fn text(doc: &Document, d: &Dictionary, key: &[u8]) -> Option<String> {
    decode_text_string(deref(doc, d.get(key).ok()?)).ok()
}

/// lopdf stores reals as f32; going through the shortest decimal form turns
/// 123.45679f32 back into 123.45679 rather than 123.456787109375.
fn number(doc: &Document, o: Option<&Object>) -> Option<f64> {
    match deref(doc, o?) {
        Object::Integer(i) => Some(*i as f64),
        Object::Real(r) => r.to_string().parse().ok(),
        _ => None,
    }
}

fn numbers(doc: &Document, o: Option<&Object>) -> Vec<f64> {
    o.and_then(|o| deref(doc, o).as_array().ok())
        .map(|a| a.iter().filter_map(|v| number(doc, Some(v))).collect())
        .unwrap_or_default()
}

fn points(doc: &Document, stroke: &Object) -> Vec<[f64; 2]> {
    numbers(doc, Some(stroke)).as_chunks::<2>().0.to_vec()
}

/// `/C` with 1 (gray), 3 (RGB) or 4 (CMYK) components; empty = transparent → `None`.
fn color_of(doc: &Document, o: Option<&Object>) -> Option<[f64; 3]> {
    components_to_rgb(&numbers(doc, o))
}

fn components_to_rgb(c: &[f64]) -> Option<[f64; 3]> {
    match *c {
        [g] => Some([g, g, g]),
        [r, g, b] => Some([r, g, b]),
        [c, m, y, k] => Some([
            (1.0 - c) * (1.0 - k),
            (1.0 - m) * (1.0 - k),
            (1.0 - y) * (1.0 - k),
        ]),
        _ => None,
    }
}

/// PDF reals carry about 7 significant digits (lopdf stores them as f32), so
/// a colour picked as `k/255` (e.g. 32/255) comes back as 0.1254902. Snaps
/// components that are that close to the `k/255` grid back onto it; other
/// values (presets such as 0.898) are left alone.
fn snap_rgb(c: [f64; 3]) -> [f64; 3] {
    c.map(|v| {
        let k = (v * 255.0).round();
        let exact = k / 255.0;
        if (v - exact).abs() <= 1e-6 { exact } else { v }
    })
}

/// Font size and fill colour from a default appearance string such as
/// `/Helv 12 Tf 0 0 0 rg`. Defaults: 12 and black.
fn parse_da(da: &str) -> (f64, [f64; 3]) {
    let mut size = 12.0;
    let mut color = BLACK;
    let mut operands: Vec<f64> = Vec::new();
    for token in da.split_whitespace() {
        if let Ok(v) = token.parse::<f64>() {
            operands.push(v);
            continue;
        }
        let n = operands.len();
        match token {
            "Tf" if n >= 1 && operands[n - 1] > 0.0 => size = operands[n - 1],
            "g" if n >= 1 => color = components_to_rgb(&operands[n - 1..]).unwrap_or(color),
            "rg" if n >= 3 => color = components_to_rgb(&operands[n - 3..]).unwrap_or(color),
            "k" if n >= 4 => color = components_to_rgb(&operands[n - 4..]).unwrap_or(color),
            _ => {}
        }
        operands.clear();
    }
    (size, color)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn da_parsing() {
        assert_eq!(parse_da("/Helv 12 Tf 0 0 0 rg"), (12.0, BLACK));
        assert_eq!(parse_da("/Helv 9.5 Tf 1 0 0 rg"), (9.5, [1.0, 0.0, 0.0]));
        assert_eq!(parse_da("0.5 g /F1 14 Tf"), (14.0, [0.5, 0.5, 0.5]));
        assert_eq!(parse_da("/Helv 0 Tf 0 0 0 1 k"), (12.0, BLACK));
        assert_eq!(parse_da(""), (12.0, BLACK));
    }

    #[test]
    fn colour_components() {
        assert_eq!(components_to_rgb(&[]), None);
        assert_eq!(
            components_to_rgb(&[0.0, 1.0, 0.0, 0.0]),
            Some([1.0, 0.0, 1.0])
        );
    }
}
