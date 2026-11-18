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
#[allow(dead_code)] // used by freetext appearance (Task 19+)
pub fn encode_winansi(s: &str) -> Vec<u8> {
    s.chars().map(encode_char).collect()
}

#[cfg(test)]
mod tests {
    use super::encode_winansi;

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
