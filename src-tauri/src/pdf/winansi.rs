/// cp1252 code points for bytes 0x80..=0x9F (None = undefined in WinAnsi).
const SPECIALS: [Option<char>; 32] = [
    Some('\u{20AC}'), None, Some('\u{201A}'), Some('\u{0192}'),
    Some('\u{201E}'), Some('\u{2026}'), Some('\u{2020}'), Some('\u{2021}'),
    Some('\u{02C6}'), Some('\u{2030}'), Some('\u{0160}'), Some('\u{2039}'),
    Some('\u{0152}'), None, Some('\u{017D}'), None,
    None, Some('\u{2018}'), Some('\u{2019}'), Some('\u{201C}'),
    Some('\u{201D}'), Some('\u{2022}'), Some('\u{2013}'), Some('\u{2014}'),
    Some('\u{02DC}'), Some('\u{2122}'), Some('\u{0161}'), Some('\u{203A}'),
    Some('\u{0153}'), None, Some('\u{017E}'), Some('\u{0178}'),
];

fn encode_char(c: char) -> u8 {
    let cp = c as u32;
    match cp {
        0x20..=0x7E | 0xA0..=0xFF => cp as u8,
        _ => SPECIALS
            .iter()
            .position(|s| *s == Some(c))
            .map(|i| 0x80 + i as u8)
            .unwrap_or(b'?'),
    }
}

/// Encodes text as WinAnsiEncoding (cp1252). Unmappable characters become `?`.
pub fn encode_winansi(s: &str) -> Vec<u8> {
    s.chars().map(encode_char).collect()
}

/// Helvetica advance widths (AFM, 1/1000 em) by WinAnsi byte, from 0x20; 0
/// for bytes WinAnsi leaves undefined (never produced by `encode_winansi`).
/// Same metrics as `measureHelvetica` in `src/core/geometry/textLayout.ts`,
/// so lines are aligned in the saved appearance exactly as on screen.
#[rustfmt::skip]
const HELVETICA_WIDTHS: [u16; 224] = [
    278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, // 0x20
    556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, // 0x30
    1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, // 0x40
    667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, // 0x50
    333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, // 0x60
    556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584, 0,   // 0x70
    556, 0, 222, 556, 333, 1000, 556, 556, 333, 1000, 667, 333, 1000, 0, 611, 0,    // 0x80
    0, 222, 222, 333, 333, 350, 556, 1000, 333, 1000, 500, 333, 944, 0, 500, 667,   // 0x90
    278, 333, 556, 556, 556, 556, 260, 556, 333, 737, 370, 556, 584, 333, 737, 333, // 0xA0
    400, 584, 333, 333, 333, 556, 537, 278, 333, 333, 365, 556, 834, 834, 834, 611, // 0xB0
    667, 667, 667, 667, 667, 667, 1000, 722, 667, 667, 667, 667, 278, 278, 278, 278, // 0xC0
    722, 722, 778, 778, 778, 778, 778, 584, 778, 722, 722, 722, 722, 667, 667, 611, // 0xD0
    556, 556, 556, 556, 556, 556, 889, 500, 556, 556, 556, 556, 278, 278, 278, 278, // 0xE0
    556, 556, 556, 556, 556, 556, 556, 584, 611, 556, 556, 556, 556, 500, 556, 500, // 0xF0
];

/// Width of `s` in Helvetica at `size` pt, as drawn: characters WinAnsi cannot
/// encode count as the `?` they are written as.
pub fn helvetica_width(s: &str, size: f64) -> f64 {
    let units: u32 = encode_winansi(s)
        .into_iter()
        .map(|b| if b >= 0x20 { u32::from(HELVETICA_WIDTHS[usize::from(b - 0x20)]) } else { 556 })
        .sum();
    f64::from(units) * size / 1000.0
}

#[cfg(test)]
mod tests {
    use super::{encode_winansi, helvetica_width};

    #[test]
    fn helvetica_width_uses_afm_metrics() {
        assert!((helvetica_width("Hi", 10.0) - 9.44).abs() < 1e-9);
        // € (0x80), Ü (0xDC) and an emoji written as '?'.
        assert!((helvetica_width("€Ü😀", 1.0) - (0.556 + 0.722 + 0.556)).abs() < 1e-9);
        assert_eq!(helvetica_width("", 12.0), 0.0);
    }

    #[test]
    fn winansi_keeps_umlauts() {
        assert_eq!(encode_winansi("äöüß"), vec![0xE4, 0xF6, 0xFC, 0xDF]);
    }

    #[test]
    fn winansi_replaces_emoji() {
        assert_eq!(encode_winansi("a😀"), b"a?".to_vec());
    }

    #[test]
    fn winansi_maps_euro() {
        assert_eq!(encode_winansi("€"), vec![0x80]);
    }

    #[test]
    fn winansi_maps_specials() {
        assert_eq!(
            encode_winansi("„…‘’“”–—™"),
            vec![0x84, 0x85, 0x91, 0x92, 0x93, 0x94, 0x96, 0x97, 0x99]
        );
        assert_eq!(encode_winansi("Šžœ"), vec![0x8A, 0x9E, 0x9C]);
        assert_eq!(encode_winansi("\u{A0}\u{FF}"), vec![0xA0, 0xFF]);
    }

    #[test]
    fn winansi_unmapped_and_control() {
        assert_eq!(encode_winansi("\u{81}\u{3042}\n"), b"???".to_vec());
        assert_eq!(encode_winansi("Abc 1"), b"Abc 1".to_vec());
    }
}
