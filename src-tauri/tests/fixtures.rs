//! PDF fixtures built with lopdf. Used by `roundtrip.rs` via `mod fixtures;`.
use lopdf::content::{Content, Operation};
use lopdf::xref::XrefType;
use lopdf::{Document, Object, ObjectId, SaveOptions, Stream, dictionary};

/// Builds an A4 document with one text line per page; `customize` may add objects
/// or change page dictionaries before saving.
fn build(pages: usize, customize: impl FnOnce(&mut Document, &[ObjectId])) -> Document {
    let mut doc = Document::with_version("1.5");
    let pages_id = doc.new_object_id();
    let font_id = doc.add_object(dictionary! {
        "Type" => "Font",
        "Subtype" => "Type1",
        "BaseFont" => "Helvetica",
    });
    let resources_id = doc.add_object(dictionary! {
        "Font" => dictionary! { "F1" => font_id },
    });
    let mut page_ids = Vec::new();
    for i in 0..pages {
        let content = Content {
            operations: vec![
                Operation::new("BT", vec![]),
                Operation::new("Tf", vec!["F1".into(), 24.into()]),
                Operation::new("Td", vec![72.into(), 770.into()]),
                Operation::new(
                    "Tj",
                    vec![Object::string_literal(format!("Page {}", i + 1))],
                ),
                Operation::new("ET", vec![]),
            ],
        };
        let content_id = doc.add_object(Stream::new(dictionary! {}, content.encode().unwrap()));
        page_ids.push(doc.add_object(dictionary! {
            "Type" => "Page",
            "Parent" => pages_id,
            "Contents" => content_id,
        }));
    }
    doc.objects.insert(
        pages_id,
        Object::Dictionary(dictionary! {
            "Type" => "Pages",
            "Kids" => page_ids.iter().map(|&id| Object::Reference(id)).collect::<Vec<_>>(),
            "Count" => pages as i64,
            "Resources" => resources_id,
            "MediaBox" => vec![0.into(), 0.into(), 595.into(), 842.into()],
        }),
    );
    let catalog_id = doc.add_object(dictionary! { "Type" => "Catalog", "Pages" => pages_id });
    doc.trailer.set("Root", catalog_id);
    customize(&mut doc, &page_ids);
    doc
}

/// Saves with a classic cross-reference table (lopdf defaults to xref streams).
fn save(mut doc: Document) -> Vec<u8> {
    doc.reference_table.cross_reference_type = XrefType::CrossReferenceTable;
    let mut out = Vec::new();
    doc.save_to(&mut out).unwrap();
    out
}

fn link_annot(doc: &mut Document, page: ObjectId) -> ObjectId {
    doc.add_object(dictionary! {
        "Type" => "Annot",
        "Subtype" => "Link",
        "Rect" => vec![72.into(), 700.into(), 200.into(), 720.into()],
        "Border" => vec![0.into(), 0.into(), 0.into()],
        "A" => dictionary! { "S" => "URI", "URI" => Object::string_literal("https://example.com") },
        "P" => page,
    })
}

/// A4, one text line per page, classic xref table.
pub fn simple_pdf(pages: usize) -> Vec<u8> {
    save(build(pages, |_, _| {}))
}

/// One page with `/Rotate 90`.
pub fn rotated_pdf() -> Vec<u8> {
    save(build(1, |doc, pages| {
        doc.get_dictionary_mut(pages[0]).unwrap().set("Rotate", 90);
    }))
}

/// Page 0 has a direct `/Annots` array with an `/Ink` lacking `/AP` and `/JuliePDF`
/// (from "another tool", with keys JuliePDF does not own such as `/Contents`) and a `/Link`.
pub fn pdf_with_foreign_annots() -> Vec<u8> {
    save(build(1, |doc, pages| {
        let ink = doc.add_object(dictionary! {
            "Type" => "Annot",
            "Subtype" => "Ink",
            "Rect" => vec![90.into(), 90.into(), 210.into(), 160.into()],
            "InkList" => vec![Object::Array(vec![100.into(), 100.into(), 150.into(), 150.into(), 200.into(), 100.into()])],
            "C" => vec![0.into(), 0.into(), 1.into()],
            "NM" => Object::string_literal("foreign-ink"),
            "T" => Object::string_literal("Drawboard"),
            "M" => Object::string_literal("D:20260102030405+01'00'"),
            "Contents" => Object::string_literal("a reviewer note"),
            "CreationDate" => Object::string_literal("D:20260101000000Z"),
            "RC" => Object::string_literal("<body><p>a reviewer note</p></body>"),
            "StructParent" => 7,
        });
        let link = link_annot(doc, pages[0]);
        doc.get_dictionary_mut(pages[0]).unwrap().set(
            "Annots",
            vec![Object::Reference(ink), Object::Reference(link)],
        );
    }))
}

/// Page 0 has a foreign `/FreeText` carrying rich text (`/RC`), `/RD`, `/CL`
/// and `/IT` next to keys JuliePDF does not own.
pub fn pdf_with_foreign_freetext() -> Vec<u8> {
    save(build(1, |doc, pages| {
        let ft = doc.add_object(dictionary! {
            "Type" => "Annot",
            "Subtype" => "FreeText",
            "Rect" => vec![100.into(), 600.into(), 300.into(), 640.into()],
            "NM" => Object::string_literal("foreign-ft"),
            "Contents" => Object::string_literal("old text"),
            "DA" => Object::string_literal("/Helv 12 Tf 0 0 0 rg"),
            "RC" => Object::string_literal("<body><p>old text</p></body>"),
            "RD" => vec![1.into(), 1.into(), 1.into(), 1.into()],
            "CL" => vec![90.into(), 590.into(), 100.into(), 610.into()],
            "IT" => "FreeTextCallout",
            "CreationDate" => Object::string_literal("D:20260101000000Z"),
        });
        doc.get_dictionary_mut(pages[0]).unwrap().set("Annots", vec![Object::Reference(ft)]);
    }))
}

fn foreign_ink(doc: &mut Document, nm: Option<&str>, x: i64, extra: lopdf::Dictionary) -> ObjectId {
    let mut d = dictionary! {
        "Type" => "Annot",
        "Subtype" => "Ink",
        "Rect" => vec![(x - 10).into(), 90.into(), (x + 60).into(), 160.into()],
        "InkList" => vec![Object::Array(vec![x.into(), 100.into(), (x + 50).into(), 150.into()])],
    };
    if let Some(nm) = nm {
        d.set("NM", Object::string_literal(nm));
    }
    for (k, v) in extra {
        d.set(k, v);
    }
    doc.add_object(d)
}

/// Page 0 lists ink A (`/NM dup`) twice and ink B, which repeats `/NM dup`;
/// page 1 lists ink A again.
pub fn pdf_with_duplicate_annots() -> Vec<u8> {
    save(build(2, |doc, pages| {
        let a = foreign_ink(doc, Some("dup"), 100, dictionary! {});
        let b = foreign_ink(doc, Some("dup"), 300, dictionary! {});
        doc.get_dictionary_mut(pages[0]).unwrap().set(
            "Annots",
            vec![Object::Reference(a), Object::Reference(b), Object::Reference(a)],
        );
        doc.get_dictionary_mut(pages[1]).unwrap().set("Annots", vec![Object::Reference(a)]);
    }))
}

/// Page 0 holds one drawable ink (`/NM ok`) and annotations JuliePDF cannot
/// draw or must not show: ink without points, highlight without
/// `/QuadPoints`, FreeText with a zero or missing `/Rect`, and inks flagged
/// Hidden (`/F 2`) or NoView (`/F 32`).
pub fn pdf_with_undrawable_annots() -> Vec<u8> {
    save(build(1, |doc, pages| {
        let ok = foreign_ink(doc, Some("ok"), 100, dictionary! { "F" => 4 });
        let no_list = doc.add_object(dictionary! {
            "Type" => "Annot", "Subtype" => "Ink", "NM" => Object::string_literal("no-list"),
            "Rect" => vec![0.into(), 0.into(), 10.into(), 10.into()],
        });
        let empty_list = doc.add_object(dictionary! {
            "Type" => "Annot", "Subtype" => "Ink", "NM" => Object::string_literal("empty-list"),
            "Rect" => vec![0.into(), 0.into(), 10.into(), 10.into()],
            "InkList" => vec![Object::Array(vec![]), Object::Array(vec![5.into()])],
        });
        let no_quads = doc.add_object(dictionary! {
            "Type" => "Annot", "Subtype" => "Highlight", "NM" => Object::string_literal("no-quads"),
            "Rect" => vec![0.into(), 0.into(), 10.into(), 10.into()],
        });
        let zero_rect = doc.add_object(dictionary! {
            "Type" => "Annot", "Subtype" => "FreeText", "NM" => Object::string_literal("zero-rect"),
            "Rect" => vec![10.into(), 10.into(), 10.into(), 40.into()],
            "Contents" => Object::string_literal("x"),
        });
        let no_rect = doc.add_object(dictionary! {
            "Type" => "Annot", "Subtype" => "FreeText", "NM" => Object::string_literal("no-rect"),
            "Contents" => Object::string_literal("x"),
        });
        let hidden = foreign_ink(doc, Some("hidden"), 200, dictionary! { "F" => 2 });
        let no_view = foreign_ink(doc, Some("no-view"), 300, dictionary! { "F" => 36 });
        let annots = [ok, no_list, empty_list, no_quads, zero_rect, no_rect, hidden, no_view]
            .map(Object::Reference)
            .to_vec();
        doc.get_dictionary_mut(pages[0]).unwrap().set("Annots", annots);
    }))
}

/// Page 0 has foreign `/Square` and `/Circle` annotations without `/JuliePDF`:
/// a blue-bordered square (`/BS /W 4`, `/CA 0.5`), a red-filled circle without
/// `/BS` and with an empty `/C`, a square with `/RD`, plus a zero-area square
/// and one with neither `/C` nor `/IC` (both undrawable).
pub fn pdf_with_foreign_shapes() -> Vec<u8> {
    save(build(1, |doc, pages| {
        let sq = doc.add_object(dictionary! {
            "Type" => "Annot", "Subtype" => "Square", "NM" => Object::string_literal("sq"),
            "Rect" => vec![100.into(), 200.into(), 300.into(), 400.into()],
            "C" => vec![0.into(), 0.into(), 1.into()],
            "CA" => Object::Real(0.5),
            "BS" => dictionary! { "W" => 4, "S" => "S" },
        });
        let circ = doc.add_object(dictionary! {
            "Type" => "Annot", "Subtype" => "Circle", "NM" => Object::string_literal("circ"),
            "Rect" => vec![100.into(), 100.into(), 200.into(), 150.into()],
            "C" => Vec::<Object>::new(),
            "IC" => vec![1.into(), 0.into(), 0.into()],
        });
        let rd = doc.add_object(dictionary! {
            "Type" => "Annot", "Subtype" => "Square", "NM" => Object::string_literal("rd"),
            "Rect" => vec![10.into(), 10.into(), 100.into(), 100.into()],
            "RD" => vec![5.into(), 6.into(), 13.into(), 11.into()],
            "C" => vec![0.into()],
            "BS" => dictionary! { "W" => 2 },
            "CreationDate" => Object::string_literal("D:20260101000000Z"),
        });
        let zero = doc.add_object(dictionary! {
            "Type" => "Annot", "Subtype" => "Square", "NM" => Object::string_literal("zero"),
            "Rect" => vec![10.into(), 10.into(), 11.into(), 50.into()],
            "C" => vec![0.into()],
        });
        let invisible = doc.add_object(dictionary! {
            "Type" => "Annot", "Subtype" => "Square", "NM" => Object::string_literal("invisible"),
            "Rect" => vec![10.into(), 10.into(), 50.into(), 50.into()],
        });
        let annots = [sq, circ, rd, zero, invisible].map(Object::Reference).to_vec();
        doc.get_dictionary_mut(pages[0]).unwrap().set("Annots", annots);
    }))
}

/// One page whose `/MediaBox` does not start at the origin
/// (`[50 100 645 942]`), optionally with `/Rotate 90`.
pub fn offset_box_pdf(rotate: bool) -> Vec<u8> {
    save(build(1, |doc, pages| {
        let page = doc.get_dictionary_mut(pages[0]).unwrap();
        page.set("MediaBox", vec![50.into(), 100.into(), 645.into(), 942.into()]);
        if rotate {
            page.set("Rotate", 90);
        }
    }))
}

/// Page 0's `/Annots` is an indirect array holding one `/Link`.
pub fn pdf_with_indirect_annots() -> Vec<u8> {
    save(build(1, |doc, pages| {
        let link = link_annot(doc, pages[0]);
        let arr = doc.add_object(Object::Array(vec![Object::Reference(link)]));
        doc.get_dictionary_mut(pages[0]).unwrap().set("Annots", arr);
    }))
}

/// Two pages saved with a cross-reference stream and object streams (PDF 1.5+,
/// like PowerPoint exports): page dictionaries live inside an object stream.
pub fn xref_stream_pdf() -> Vec<u8> {
    let mut doc = build(2, |_, _| {});
    let mut out = Vec::new();
    let opts = SaveOptions::builder()
        .use_object_streams(true)
        .use_xref_streams(true)
        .build();
    doc.save_with_options(&mut out, opts).unwrap();
    out
}

/// A slide-deck-like document for performance tests: every page has a few
/// kilobytes of text and vector drawing plus its own `w` x `h` RGB image
/// (gradient plus noise: 640x480 is about 400 KB compressed), all streams
/// Flate-compressed.
#[allow(dead_code)] // used by perf.rs only
pub fn lecture_pdf(pages: usize, (w, h): (usize, usize)) -> Vec<u8> {
    let mut seed: u32 = 0x1234_5678;
    let mut next = move || {
        seed = seed.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
        (seed >> 24) as u8
    };
    save(build(pages, |doc, page_ids| {
        for (i, &page_id) in page_ids.iter().enumerate() {
            let pixels: Vec<u8> = (0..w * h * 3)
                .map(|k| ((k / 3 % w) as u8 / 4).wrapping_add(next() / 64))
                .collect();
            let mut img = Stream::new(
                dictionary! {
                    "Type" => "XObject",
                    "Subtype" => "Image",
                    "Width" => w as i64,
                    "Height" => h as i64,
                    "ColorSpace" => "DeviceRGB",
                    "BitsPerComponent" => 8,
                },
                pixels,
            );
            img.compress().unwrap();
            let img_id = doc.add_object(img);
            let mut ops = String::from("q 300 0 0 225 250 480 cm /Im0 Do Q\n");
            ops.push_str("BT /F1 11 Tf 72 440 Td 14 TL\n");
            for line in 0..25 {
                ops.push_str(&format!(
                    "(Slide {} bullet {line}: lorem ipsum dolor sit amet, consectetur adipiscing) '\n",
                    i + 1
                ));
            }
            ops.push_str("ET\n0.2 0.4 0.8 RG 1 w\n");
            for k in 0..200 {
                let x = 72 + (k * 37) % 450;
                let y = 60 + (k * 53) % 60;
                ops.push_str(&format!("{x} {y} m {} {} l S\n", x + 20, y + 15));
            }
            let mut content = Stream::new(dictionary! {}, ops.into_bytes());
            content.compress().unwrap();
            let content_id = doc.add_object(content);
            let page = doc.get_dictionary_mut(page_id).unwrap();
            page.set("Contents", vec![page.get(b"Contents").unwrap().clone(), Object::Reference(content_id)]);
            page.set("Resources", dictionary! {
                "Font" => dictionary! { "F1" => dictionary! { "Type" => "Font", "Subtype" => "Type1", "BaseFont" => "Helvetica" } },
                "XObject" => dictionary! { "Im0" => img_id },
            });
        }
    }))
}

/// A document whose trailer carries an `/Encrypt` dictionary that the empty
/// password does not open.
pub fn encrypted_pdf() -> Vec<u8> {
    save(build(1, |doc, _| {
        let enc = doc.add_object(dictionary! {
            "Filter" => "Standard",
            "V" => 1,
            "R" => 2,
            "O" => Object::String(vec![0x11; 32], lopdf::StringFormat::Hexadecimal),
            "U" => Object::String(vec![0x22; 32], lopdf::StringFormat::Hexadecimal),
            "P" => -4,
        });
        doc.trailer.set("Encrypt", enc);
        doc.trailer.set(
            "ID",
            vec![
                Object::String(vec![1; 16], lopdf::StringFormat::Hexadecimal),
                Object::String(vec![1; 16], lopdf::StringFormat::Hexadecimal),
            ],
        );
    }))
}

#[test]
fn fixtures_load() {
    for bytes in [
        simple_pdf(3),
        rotated_pdf(),
        pdf_with_foreign_annots(),
        pdf_with_indirect_annots(),
        pdf_with_foreign_freetext(),
        pdf_with_duplicate_annots(),
        pdf_with_undrawable_annots(),
        offset_box_pdf(false),
        offset_box_pdf(true),
        xref_stream_pdf(),
    ] {
        Document::load_mem(&bytes).unwrap();
    }
    let simple = Document::load_mem(&simple_pdf(1)).unwrap();
    assert!(matches!(
        simple.reference_table.cross_reference_type,
        XrefType::CrossReferenceTable
    ));
    let enc = Document::load_mem(&encrypted_pdf());
    assert!(enc.map_or(true, |d| d.is_encrypted() || d.was_encrypted()));
    let xs = Document::load_mem(&xref_stream_pdf()).unwrap();
    assert!(matches!(
        xs.reference_table.cross_reference_type,
        XrefType::CrossReferenceStream
    ));
    assert!(
        xs.reference_table
            .entries
            .values()
            .any(|e| matches!(e, lopdf::xref::XrefEntry::Compressed { .. })),
        "page tree should sit in an object stream"
    );
}
