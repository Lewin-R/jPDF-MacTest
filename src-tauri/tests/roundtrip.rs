mod fixtures;

use std::collections::HashSet;

use juliepdf_lib::commands::files::save_to_path;
use juliepdf_lib::error::AppError;
use juliepdf_lib::pdf::dto::{AnnotationDto, Blend, Common, InkRole};
use juliepdf_lib::pdf::reader::read_annotations;
use juliepdf_lib::pdf::writer::write_incremental;
use lopdf::{Document, Object, ObjectId};

fn ink(id: &str, page: u32, color: [f64; 3]) -> AnnotationDto {
    AnnotationDto::Ink {
        common: Common {
            id: id.into(),
            page,
            source_ref: None,
            modified_at: "2026-11-18T10:00:00Z".into(),
            author: "Jülie".into(),
        },
        strokes: vec![
            vec![[100.5, 200.25], [150.0, 250.0], [200.0, 210.0]],
            vec![[300.0, 300.0]],
        ],
        color,
        width: 2.5,
        opacity: 0.5,
        blend: Blend::Multiply,
        role: InkRole::Marker,
    }
}

fn common(a: &AnnotationDto) -> &Common {
    match a {
        AnnotationDto::Ink { common, .. }
        | AnnotationDto::Highlight { common, .. }
        | AnnotationDto::Freetext { common, .. } => common,
    }
}

fn with_ref(mut a: AnnotationDto, r: &str) -> AnnotationDto {
    match &mut a {
        AnnotationDto::Ink { common, .. }
        | AnnotationDto::Highlight { common, .. }
        | AnnotationDto::Freetext { common, .. } => common.source_ref = Some(r.into()),
    }
    a
}

fn write(
    original: &[u8],
    upserts: &[AnnotationDto],
    deletes: &[&str],
) -> (Vec<u8>, std::collections::HashMap<String, String>) {
    let deletes: Vec<String> = deletes.iter().map(|s| s.to_string()).collect();
    write_incremental(original, upserts, &deletes).unwrap()
}

/// Object numbers defined (`N G obj`) in `bytes`.
fn defined_objects(bytes: &[u8]) -> HashSet<u32> {
    let text = String::from_utf8_lossy(bytes);
    let mut out = HashSet::new();
    for (pos, _) in text.match_indices(" obj") {
        let head = &text[..pos];
        let mut parts = head.rsplit(|c: char| c.is_whitespace());
        let generation = parts.next().unwrap_or("");
        let num = parts.next().unwrap_or("");
        if !generation.is_empty()
            && generation.bytes().all(|b| b.is_ascii_digit())
            && let Ok(n) = num.parse()
        {
            out.insert(n);
        }
    }
    out
}

fn page_annots(doc: &Document, page: usize) -> Vec<Object> {
    let page_id = doc.page_iter().nth(page).unwrap();
    let dict = doc.get_dictionary(page_id).unwrap();
    match dict.get_deref(b"Annots", doc) {
        Ok(Object::Array(a)) => a.clone(),
        _ => vec![],
    }
}

fn refs_of(objs: &[Object]) -> Vec<ObjectId> {
    objs.iter().filter_map(|o| o.as_reference().ok()).collect()
}

fn is_source_ref(s: &str) -> bool {
    let Some((num, generation)) = s.split_once('R') else {
        return false;
    };
    !num.is_empty()
        && num.bytes().all(|b| b.is_ascii_digit())
        && generation.bytes().all(|b| b.is_ascii_digit())
}

#[test]
fn original_bytes_are_prefix() {
    let orig = fixtures::simple_pdf(2);
    let (out, _) = write(&orig, &[ink("a", 1, [1.0, 0.0, 0.0])], &[]);
    assert!(out.len() > orig.len());
    assert_eq!(&out[..orig.len()], &orig[..]);
}

#[test]
fn xref_table_original_gets_xref_table_section() {
    let orig = fixtures::simple_pdf(1);
    let (out, _) = write(&orig, &[ink("a", 0, [0.0; 3])], &[]);
    let tail = String::from_utf8_lossy(&out[orig.len()..]).into_owned();
    assert!(tail.contains("\nxref\n") && tail.contains("trailer"), "{tail}");
    assert!(!tail.contains("/XRef"), "{tail}");
    assert!(tail.contains("/Prev "), "{tail}");
}

#[test]
fn ink_roundtrip() {
    let orig = fixtures::simple_pdf(2);
    let a = ink("a", 1, [1.0, 0.0, 0.0]);
    let (out, refs) = write(&orig, std::slice::from_ref(&a), &[]);
    let got = read_annotations(&out).unwrap();
    assert_eq!(got, vec![with_ref(a, &refs["a"])]);
}

#[test]
fn returns_source_refs_for_new_annotations() {
    let (_, refs) = write(&fixtures::simple_pdf(1), &[ink("a", 0, [0.0; 3])], &[]);
    assert_eq!(refs.len(), 1);
    assert!(is_source_ref(&refs["a"]), "{}", refs["a"]);
}

#[test]
fn edit_after_save_replaces_not_duplicates() {
    let orig = fixtures::simple_pdf(1);
    let (out1, refs1) = write(&orig, &[ink("a", 0, [1.0, 0.0, 0.0])], &[]);
    let edited = with_ref(ink("a", 0, [0.0, 0.0, 1.0]), &refs1["a"]);
    let (out2, refs2) = write(&out1, &[edited], &[]);
    assert_eq!(&out2[..out1.len()], &out1[..]);
    assert_eq!(refs2["a"], refs1["a"], "an update keeps its object number");
    let got = read_annotations(&out2).unwrap();
    assert_eq!(got.len(), 1);
    assert!(matches!(&got[0], AnnotationDto::Ink { color, .. } if *color == [0.0, 0.0, 1.0]));
    assert_eq!(page_annots(&Document::load_mem(&out2).unwrap(), 0).len(), 1);
}

#[test]
fn update_with_vanished_ref_is_written_as_new() {
    let orig = fixtures::simple_pdf(1);
    let a = with_ref(ink("a", 0, [1.0, 0.0, 0.0]), "999R");
    let (out, refs) = write(&orig, &[a], &[]);
    assert_ne!(refs["a"], "999R");
    assert_eq!(read_annotations(&out).unwrap().len(), 1);
}

#[test]
fn update_with_ref_to_non_annotation_is_written_as_new() {
    let orig = fixtures::simple_pdf(1);
    let doc = Document::load_mem(&orig).unwrap();
    let page_id = doc.page_iter().next().unwrap();
    let a = with_ref(ink("a", 0, [1.0, 0.0, 0.0]), &juliepdf_ref(page_id));
    let (out, refs) = write(&orig, &[a], &[]);
    assert_ne!(refs["a"], juliepdf_ref(page_id));
    let after = Document::load_mem(&out).unwrap();
    assert_eq!(after.page_iter().count(), 1);
    assert_eq!(read_annotations(&out).unwrap().len(), 1);
}

#[test]
fn delete_removes_from_annots() {
    let orig = fixtures::simple_pdf(1);
    let (out1, refs) = write(&orig, &[ink("a", 0, [1.0, 0.0, 0.0])], &[]);
    let (out2, _) = write(&out1, &[], &[&refs["a"], "garbage", "999R"]);
    assert!(read_annotations(&out2).unwrap().is_empty());
    assert!(page_annots(&Document::load_mem(&out2).unwrap(), 0).is_empty());
}

#[test]
fn foreign_annotations_loaded_and_link_preserved() {
    let orig = fixtures::pdf_with_foreign_annots();
    let got = read_annotations(&orig).unwrap();
    assert_eq!(got.len(), 1, "the link is not editable");
    let AnnotationDto::Ink {
        common,
        strokes,
        color,
        width,
        opacity,
        blend,
        role,
    } = &got[0]
    else {
        panic!("expected ink: {got:?}")
    };
    assert_eq!(common.id, "foreign-ink");
    assert_eq!(common.author, "Drawboard");
    assert_eq!(common.page, 0);
    assert_eq!(common.modified_at, "2026-01-02T02:04:05Z");
    assert!(common.source_ref.is_some());
    assert_eq!(
        strokes,
        &vec![vec![[100.0, 100.0], [150.0, 150.0], [200.0, 100.0]]]
    );
    assert_eq!(
        (*color, *width, *opacity, *blend, *role),
        ([0.0, 0.0, 1.0], 1.0, 1.0, Blend::Normal, InkRole::Pen)
    );

    let doc = Document::load_mem(&orig).unwrap();
    let link_id = refs_of(&page_annots(&doc, 0))
        .into_iter()
        .find(|&id| {
            doc.get_dictionary(id)
                .unwrap()
                .get(b"Subtype")
                .unwrap()
                .as_name()
                .unwrap()
                == b"Link"
        })
        .unwrap();
    let link_before = doc.get_object(link_id).unwrap().clone();

    let (out, _) = write(&orig, &[ink("new", 0, [1.0, 0.0, 0.0])], &[]);
    assert!(
        !defined_objects(&out[orig.len()..]).contains(&link_id.0),
        "link object must not be rewritten"
    );
    let after = Document::load_mem(&out).unwrap();
    let annots = refs_of(&page_annots(&after, 0));
    assert_eq!(annots.len(), 3);
    assert!(annots.contains(&link_id));
    assert_eq!(after.get_object(link_id).unwrap(), &link_before);
    assert_eq!(read_annotations(&out).unwrap().len(), 2);
}

#[test]
fn page_without_annots_array_gets_one() {
    let orig = fixtures::simple_pdf(2);
    assert!(page_annots(&Document::load_mem(&orig).unwrap(), 1).is_empty());
    let (out, refs) = write(&orig, &[ink("a", 1, [0.0; 3])], &[]);
    let doc = Document::load_mem(&out).unwrap();
    let annots = refs_of(&page_annots(&doc, 1));
    assert_eq!(annots.len(), 1);
    assert_eq!(juliepdf_ref(annots[0]), refs["a"]);
    assert!(page_annots(&doc, 0).is_empty());
}

fn juliepdf_ref((num, generation): ObjectId) -> String {
    if generation == 0 {
        format!("{num}R")
    } else {
        format!("{num}R{generation}")
    }
}

#[test]
fn page_with_indirect_annots_array_is_updated() {
    let orig = fixtures::pdf_with_indirect_annots();
    let doc = Document::load_mem(&orig).unwrap();
    let page_id = doc.page_iter().next().unwrap();
    let arr_id = doc
        .get_dictionary(page_id)
        .unwrap()
        .get(b"Annots")
        .unwrap()
        .as_reference()
        .unwrap();

    let (out, _) = write(&orig, &[ink("a", 0, [0.0; 3])], &[]);
    let appended = defined_objects(&out[orig.len()..]);
    assert!(
        appended.contains(&arr_id.0),
        "the annots array object is revised"
    );
    assert!(
        !appended.contains(&page_id.0),
        "the page itself is untouched"
    );
    let after = Document::load_mem(&out).unwrap();
    assert_eq!(page_annots(&after, 0).len(), 2);
    assert_eq!(read_annotations(&out).unwrap().len(), 1);
}

#[test]
fn two_annotations_on_one_page() {
    let orig = fixtures::simple_pdf(1);
    let (out1, refs1) = write(
        &orig,
        &[ink("a", 0, [1.0, 0.0, 0.0]), ink("b", 0, [0.0, 1.0, 0.0])],
        &[],
    );
    assert_ne!(refs1["a"], refs1["b"]);
    let got = read_annotations(&out1).unwrap();
    let ids: Vec<&str> = got.iter().map(|a| common(a).id.as_str()).collect();
    assert_eq!(ids, ["a", "b"]);

    let (out2, _) = write(&out1, &[ink("c", 0, [0.0, 0.0, 1.0])], &[]);
    let ids: Vec<String> = read_annotations(&out2)
        .unwrap()
        .iter()
        .map(|a| common(a).id.clone())
        .collect();
    assert_eq!(ids, ["a", "b", "c"]);
}

#[test]
fn xref_stream_original_roundtrip() {
    let orig = fixtures::xref_stream_pdf();
    let a = ink("a", 1, [1.0, 0.0, 0.0]);
    let (out1, refs) = write(&orig, std::slice::from_ref(&a), &[]);
    assert_eq!(&out1[..orig.len()], &orig[..]);
    let tail = String::from_utf8_lossy(&out1[orig.len()..]).into_owned();
    assert!(
        tail.contains("/XRef"),
        "appended section must be an xref stream: {tail}"
    );
    assert!(
        !tail.contains("\nxref\n") && !tail.contains("trailer"),
        "no classic table: {tail}"
    );

    let doc = Document::load_mem(&out1).unwrap();
    assert_eq!(doc.page_iter().count(), 2);
    assert_eq!(
        read_annotations(&out1).unwrap(),
        vec![with_ref(a, &refs["a"])]
    );

    let edited = with_ref(ink("a", 1, [0.0, 1.0, 0.0]), &refs["a"]);
    let (out2, _) = write(&out1, &[edited, ink("b", 0, [0.0; 3])], &[]);
    let got = read_annotations(&out2).unwrap();
    assert_eq!(got.len(), 2);
    assert!(got.iter().any(|a| matches!(a, AnnotationDto::Ink { common, color, .. } if common.id == "a" && *color == [0.0, 1.0, 0.0])));
    let (out3, _) = write(&out2, &[], &[&refs["a"]]);
    assert_eq!(read_annotations(&out3).unwrap().len(), 1);
}

#[test]
fn rotated_page_roundtrip() {
    let orig = fixtures::rotated_pdf();
    let a = ink("a", 0, [0.0; 3]);
    let (out, refs) = write(&orig, std::slice::from_ref(&a), &[]);
    assert_eq!(
        read_annotations(&out).unwrap(),
        vec![with_ref(a, &refs["a"])]
    );
}

#[test]
fn output_reloads_with_lopdf() {
    let orig = fixtures::simple_pdf(3);
    let (out, refs) = write(&orig, &[ink("a", 2, [0.0; 3])], &[]);
    let doc = Document::load_mem(&out).unwrap();
    assert_eq!(doc.page_iter().count(), 3);
    let annot = doc.get_dictionary(lopdf_id(&refs["a"])).unwrap();
    assert_eq!(annot.get(b"Subtype").unwrap().as_name().unwrap(), b"Ink");
    assert_eq!(annot.get(b"F").unwrap().as_i64().unwrap(), 4);
    let ap = annot
        .get(b"AP")
        .unwrap()
        .as_dict()
        .unwrap()
        .get(b"N")
        .unwrap()
        .as_reference()
        .unwrap();
    let stream = doc.get_object(ap).unwrap().as_stream().unwrap();
    assert_eq!(
        stream.dict.get(b"Subtype").unwrap().as_name().unwrap(),
        b"Form"
    );
    let content = stream.decompressed_content().unwrap();
    assert!(
        content.starts_with(b"q\n2.5 w\n"),
        "{}",
        String::from_utf8_lossy(&content)
    );
}

fn lopdf_id(r: &str) -> ObjectId {
    let (num, generation) = r.split_once('R').unwrap();
    (
        num.parse().unwrap(),
        if generation.is_empty() {
            0
        } else {
            generation.parse().unwrap()
        },
    )
}

#[test]
fn unsupported_kind_and_bad_page_are_invalid() {
    let orig = fixtures::simple_pdf(1);
    let hl = AnnotationDto::Highlight {
        common: common(&ink("h", 0, [0.0; 3])).clone(),
        quads: vec![[0.0, 10.0, 10.0, 10.0, 0.0, 0.0, 10.0, 0.0]],
        color: [1.0, 1.0, 0.0],
        opacity: 0.4,
    };
    let err = write_incremental(&orig, &[hl], &[]).unwrap_err();
    assert!(
        matches!(&err, AppError::InvalidPdf(m) if m == "unsupported annotation kind: highlight"),
        "{err:?}"
    );
    let err = write_incremental(&orig, &[ink("a", 5, [0.0; 3])], &[]).unwrap_err();
    assert!(matches!(err, AppError::InvalidPdf(_)));
}

#[test]
fn empty_ink_is_skipped() {
    let orig = fixtures::simple_pdf(1);
    let mut a = ink("a", 0, [0.0; 3]);
    if let AnnotationDto::Ink { strokes, .. } = &mut a {
        *strokes = vec![vec![]];
    }
    let (out, refs) = write(&orig, &[a], &[]);
    assert!(refs.is_empty());
    assert!(read_annotations(&out).unwrap().is_empty());
}

#[test]
fn encrypted_and_garbage_inputs() {
    let enc = fixtures::encrypted_pdf();
    assert!(matches!(
        read_annotations(&enc),
        Err(AppError::Encrypted(_))
    ));
    assert!(matches!(
        write_incremental(&enc, &[ink("a", 0, [0.0; 3])], &[]),
        Err(AppError::Encrypted(_))
    ));
    assert!(matches!(
        read_annotations(b"hello"),
        Err(AppError::InvalidPdf(_))
    ));
    assert!(matches!(
        write_incremental(b"hello", &[], &[]),
        Err(AppError::InvalidPdf(_))
    ));
}

fn temp_pdf(name: &str, bytes: &[u8]) -> (tempfile::TempDir, std::path::PathBuf) {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join(name);
    std::fs::write(&path, bytes).unwrap();
    (dir, path)
}

#[test]
fn save_to_path_writes_and_reloads() {
    let orig = fixtures::simple_pdf(1);
    let (dir, path) = temp_pdf("lecture.pdf", &orig);
    let res = save_to_path(&path, &path, &[ink("a", 0, [0.0; 3])], &[]).unwrap();
    let saved = std::fs::read(&path).unwrap();
    assert_eq!(&saved[..orig.len()], &orig[..]);
    let got = read_annotations(&saved).unwrap();
    assert_eq!(
        common(&got[0]).source_ref.as_deref(),
        Some(res.refs["a"].as_str())
    );
    let leftovers: Vec<_> = std::fs::read_dir(dir.path()).unwrap().collect();
    assert_eq!(leftovers.len(), 1, "no temp file left behind");
}

#[cfg(windows)]
#[test]
fn save_to_locked_file_returns_locked_and_keeps_original() {
    use std::os::windows::fs::OpenOptionsExt;
    let orig = fixtures::simple_pdf(1);
    let (dir, path) = temp_pdf("locked.pdf", &orig);
    let src = dir.path().join("source.pdf");
    std::fs::write(&src, &orig).unwrap();
    {
        let _lock = std::fs::OpenOptions::new()
            .read(true)
            .share_mode(0)
            .open(&path)
            .unwrap();
        let err = save_to_path(&src, &path, &[ink("a", 0, [0.0; 3])], &[]).unwrap_err();
        assert!(matches!(err, AppError::Locked(_)), "{err:?}");
        let err = save_to_path(&path, &path, &[ink("a", 0, [0.0; 3])], &[]).unwrap_err();
        assert!(matches!(err, AppError::Locked(_)), "{err:?}");
    }
    assert_eq!(std::fs::read(&path).unwrap(), orig);
    assert_eq!(
        std::fs::read_dir(dir.path()).unwrap().count(),
        2,
        "no temp file left behind"
    );
}

#[test]
fn save_to_read_only_file_returns_read_only_and_keeps_original() {
    let orig = fixtures::simple_pdf(1);
    let (_dir, path) = temp_pdf("ro.pdf", &orig);
    let mut perms = std::fs::metadata(&path).unwrap().permissions();
    perms.set_readonly(true);
    std::fs::set_permissions(&path, perms.clone()).unwrap();
    let err = save_to_path(&path, &path, &[ink("a", 0, [0.0; 3])], &[]).unwrap_err();
    let after = std::fs::read(&path).unwrap();
    #[allow(clippy::permissions_set_readonly_false)]
    perms.set_readonly(false);
    std::fs::set_permissions(&path, perms).unwrap();
    assert!(matches!(err, AppError::ReadOnly(_)), "{err:?}");
    assert_eq!(after, orig);
}

#[test]
fn save_with_invalid_input_keeps_original() {
    let (_dir, path) = temp_pdf("bad.pdf", b"not a pdf");
    let err = save_to_path(&path, &path, &[ink("a", 0, [0.0; 3])], &[]).unwrap_err();
    assert!(matches!(err, AppError::InvalidPdf(_)));
    assert_eq!(std::fs::read(&path).unwrap(), b"not a pdf");
}
