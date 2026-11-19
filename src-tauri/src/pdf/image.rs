//! Pasted images: base64 PNG in the DTO, RGB samples plus an optional alpha
//! channel (the soft mask) in the PDF.
use std::io::Cursor;

use base64::Engine;
use base64::engine::general_purpose::STANDARD;

use crate::error::AppError;

/// A decoded image: 8-bit RGB samples, and the 8-bit alpha channel when any
/// pixel is not fully opaque.
#[derive(Debug, PartialEq)]
pub struct Pixels {
    pub width: u32,
    pub height: u32,
    pub rgb: Vec<u8>,
    pub alpha: Option<Vec<u8>>,
}

pub fn decode_base64(data: &str) -> Result<Vec<u8>, AppError> {
    STANDARD
        .decode(data)
        .map_err(|e| AppError::InvalidPdf(format!("the image data is not valid base64: {e}")))
}

pub fn encode_base64(bytes: &[u8]) -> String {
    STANDARD.encode(bytes)
}

fn not_png(e: impl std::fmt::Display) -> AppError {
    AppError::InvalidPdf(format!("the image is not a valid PNG: {e}"))
}

/// Pixel size from the PNG header; `None` if `bytes` is not a PNG.
pub fn png_size(bytes: &[u8]) -> Option<(u32, u32)> {
    let reader = png::Decoder::new(Cursor::new(bytes)).read_info().ok()?;
    let (w, h) = reader.info().size();
    (w > 0 && h > 0).then_some((w, h))
}

/// Decodes any PNG (palette, gray, 16-bit, transparency chunk) to 8-bit RGB
/// plus alpha (first frame of an animated PNG).
pub fn decode_png(bytes: &[u8]) -> Result<Pixels, AppError> {
    let mut decoder = png::Decoder::new(Cursor::new(bytes));
    decoder.set_transformations(png::Transformations::EXPAND | png::Transformations::STRIP_16);
    let mut reader = decoder.read_info().map_err(not_png)?;
    let size = reader.output_buffer_size().ok_or_else(|| not_png("too large"))?;
    let mut buf = vec![0; size];
    let info = reader.next_frame(&mut buf).map_err(not_png)?;
    let (width, height) = (info.width, info.height);
    if width == 0 || height == 0 {
        return Err(not_png("empty image"));
    }
    let channels = match info.color_type {
        png::ColorType::Grayscale => 1,
        png::ColorType::GrayscaleAlpha => 2,
        png::ColorType::Rgb => 3,
        png::ColorType::Rgba => 4,
        png::ColorType::Indexed => return Err(not_png("unexpanded palette")),
    };
    let n = width as usize * height as usize;
    let mut rgb = Vec::with_capacity(n * 3);
    let mut alpha = Vec::with_capacity(n);
    for row in buf[..info.buffer_size()].chunks_exact(info.line_size) {
        for px in row[..width as usize * channels].chunks_exact(channels) {
            match *px {
                [g] => rgb.extend([g, g, g]),
                [g, a] => {
                    rgb.extend([g, g, g]);
                    alpha.push(a);
                }
                [r, g, b] => rgb.extend([r, g, b]),
                [r, g, b, a] => {
                    rgb.extend([r, g, b]);
                    alpha.push(a);
                }
                _ => unreachable!("chunks of `channels` bytes"),
            }
        }
    }
    let alpha = (alpha.iter().any(|&a| a < 255)).then_some(alpha);
    Ok(Pixels { width, height, rgb, alpha })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn encode(w: u32, h: u32, color: png::ColorType, depth: png::BitDepth, data: &[u8], trns: Option<&[u8]>, palette: Option<&[u8]>) -> Vec<u8> {
        let mut out = Vec::new();
        {
            let mut enc = png::Encoder::new(&mut out, w, h);
            enc.set_color(color);
            enc.set_depth(depth);
            if let Some(p) = palette {
                enc.set_palette(p.to_vec());
            }
            if let Some(t) = trns {
                enc.set_trns(t.to_vec());
            }
            enc.write_header().unwrap().write_image_data(data).unwrap();
        }
        out
    }

    #[test]
    fn gray_expands_to_rgb_without_alpha() {
        let bytes = encode(2, 1, png::ColorType::Grayscale, png::BitDepth::Eight, &[10, 200], None, None);
        let p = decode_png(&bytes).unwrap();
        assert_eq!(p, Pixels { width: 2, height: 1, rgb: vec![10, 10, 10, 200, 200, 200], alpha: None });
        assert_eq!(png_size(&bytes), Some((2, 1)));
    }

    #[test]
    fn palette_with_transparency_gets_alpha() {
        let bytes = encode(
            2,
            1,
            png::ColorType::Indexed,
            png::BitDepth::Eight,
            &[0, 1],
            Some(&[0]),
            Some(&[255, 0, 0, 0, 0, 255]),
        );
        let p = decode_png(&bytes).unwrap();
        assert_eq!(p.rgb, vec![255, 0, 0, 0, 0, 255]);
        assert_eq!(p.alpha, Some(vec![0, 255]));
    }

    #[test]
    fn sixteen_bit_is_stripped_to_eight() {
        let bytes = encode(1, 1, png::ColorType::Rgb, png::BitDepth::Sixteen, &[0xAB, 0, 0x12, 0, 0xFF, 0xFF], None, None);
        assert_eq!(decode_png(&bytes).unwrap().rgb, vec![0xAB, 0x12, 0xFF]);
    }

    #[test]
    fn garbage_is_rejected() {
        assert!(matches!(decode_png(b"nope"), Err(AppError::InvalidPdf(_))));
        assert_eq!(png_size(b"nope"), None);
        assert!(matches!(decode_base64("**"), Err(AppError::InvalidPdf(_))));
    }
}
