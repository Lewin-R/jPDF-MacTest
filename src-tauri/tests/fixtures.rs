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
