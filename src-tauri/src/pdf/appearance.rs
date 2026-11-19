use super::dto::{Background, Fill, ShapeKind, Stroke};
use super::fmt::fmt_num;
use super::winansi::encode_winansi;

/// An appearance stream description, built independent of lopdf.
///
/// `content` uses absolute PDF user-space coordinates (no translation), so the
/// writer must set the form XObject `/BBox` = `bbox` with `/Matrix` = `matrix`
/// (identity when `None`) and the annotation `/Rect` = `rect()` (`bbox`
/// transformed by `matrix`, so the form maps onto `/Rect` without scaling).
/// The writer builds the `/ExtGState` resource `GS0` from `opacity` (`/CA`, `/ca`)
/// and `multiply` (`/BM /Multiply`), a further `/ExtGState` entry per
/// `gstates` item, and a Helvetica font resource if `uses_helvetica`.
#[derive(Clone, Debug, PartialEq)]
pub struct Appearance {
    pub bbox: [f64; 4],
    pub content: Vec<u8>,
    pub opacity: f64,
    pub multiply: bool,
    pub uses_helvetica: bool,
    pub matrix: Option<[f64; 6]>,
    /// Extra named graphics states (shapes: separate fill and stroke opacity).
    pub gstates: Vec<NamedGState>,
}

/// An `/ExtGState` resource `name` setting `/ca` (fill) and/or `/CA` (stroke) opacity.
#[derive(Clone, Debug, PartialEq)]
pub struct NamedGState {
    pub name: &'static str,
    pub fill_opacity: Option<f64>,
    pub stroke_opacity: Option<f64>,
}

impl Appearance {
    /// Bounding box of `bbox` transformed by `matrix`: the annotation `/Rect`.
    pub fn rect(&self) -> [f64; 4] {
        match self.matrix {
            None => self.bbox,
            Some(m) => transformed_bounds(self.bbox, m),
        }
    }
}

fn transformed_bounds(b: [f64; 4], m: [f64; 6]) -> [f64; 4] {
    let (mut x1, mut y1, mut x2, mut y2) = (f64::MAX, f64::MAX, f64::MIN, f64::MIN);
    for (x, y) in [(b[0], b[1]), (b[2], b[1]), (b[0], b[3]), (b[2], b[3])] {
        let tx = m[0] * x + m[2] * y + m[4];
        let ty = m[1] * x + m[3] * y + m[5];
        x1 = x1.min(tx);
        y1 = y1.min(ty);
        x2 = x2.max(tx);
        y2 = y2.max(ty);
    }
    [x1, y1, x2, y2]
}

fn mid(a: [f64; 2], b: [f64; 2]) -> [f64; 2] {
    [(a[0] + b[0]) / 2.0, (a[1] + b[1]) / 2.0]
}

fn pt(p: [f64; 2]) -> String {
    format!("{} {}", fmt_num(p[0]), fmt_num(p[1]))
}

/// Same midpoint-quadratic scheme as the TS `smoothPath`, with quadratics
/// converted to cubics.
fn stroke_path(s: &[[f64; 2]], out: &mut String) {
    let n = s.len();
    out.push_str(&format!("{} m\n", pt(s[0])));
    if n == 1 {
        out.push_str(&format!("{} l\n", pt(s[0])));
        return;
    }
    let mut cur = s[0];
    for i in 1..=n.saturating_sub(2) {
        let c = s[i];
        let end = mid(s[i], s[i + 1]);
        let c1 = [cur[0] + 2.0 / 3.0 * (c[0] - cur[0]), cur[1] + 2.0 / 3.0 * (c[1] - cur[1])];
        let c2 = [end[0] + 2.0 / 3.0 * (c[0] - end[0]), end[1] + 2.0 / 3.0 * (c[1] - end[1])];
        out.push_str(&format!("{} {} {} c\n", pt(c1), pt(c2), pt(end)));
        cur = end;
    }
    out.push_str(&format!("{} l\n", pt(s[n - 1])));
}

/// Callers (the writer) must skip ink annotations whose strokes are all empty:
/// they yield a zero bbox and no drawing operators.
pub fn ink_appearance(strokes: &[Vec<[f64; 2]>], color: [f64; 3], width: f64, opacity: f64, multiply: bool) -> Appearance {
    let (mut x1, mut y1, mut x2, mut y2) = (f64::MAX, f64::MAX, f64::MIN, f64::MIN);
    let mut any = false;
    for p in strokes.iter().flatten() {
        any = true;
        x1 = x1.min(p[0]);
        y1 = y1.min(p[1]);
        x2 = x2.max(p[0]);
        y2 = y2.max(p[1]);
    }
    let pad = width / 2.0 + 1.0;
    let bbox = if any { [x1 - pad, y1 - pad, x2 + pad, y2 + pad] } else { [0.0; 4] };

    let mut c = format!(
        "q\n{} w\n1 J\n1 j\n{} {} {} RG\n/GS0 gs\n",
        fmt_num(width),
        fmt_num(color[0]),
        fmt_num(color[1]),
        fmt_num(color[2])
    );
    for s in strokes.iter().filter(|s| !s.is_empty()) {
        stroke_path(s, &mut c);
        c.push_str("S\n");
    }
    c.push_str("Q\n");

    Appearance { bbox, content: c.into_bytes(), opacity, multiply, uses_helvetica: false, matrix: None, gstates: Vec::new() }
}

/// One filled path per quad (QuadPoints order TL, TR, BL, BR; drawn TL→TR→BR→BL),
/// multiply-blended. `bbox` = union of the quads (zero if there are none).
pub fn highlight_appearance(quads: &[[f64; 8]], color: [f64; 3], opacity: f64) -> Appearance {
    let (mut x1, mut y1, mut x2, mut y2) = (f64::MAX, f64::MAX, f64::MIN, f64::MIN);
    for q in quads {
        for p in q.chunks_exact(2) {
            x1 = x1.min(p[0]);
            y1 = y1.min(p[1]);
            x2 = x2.max(p[0]);
            y2 = y2.max(p[1]);
        }
    }
    let bbox = if quads.is_empty() { [0.0; 4] } else { [x1, y1, x2, y2] };

    let mut c = format!(
        "q\n{} {} {} rg\n/GS0 gs\n",
        fmt_num(color[0]),
        fmt_num(color[1]),
        fmt_num(color[2])
    );
    for q in quads {
        c.push_str(&format!(
            "{} m\n{} l\n{} l\n{} l\nh\nf\n",
            pt([q[0], q[1]]),
            pt([q[2], q[3]]),
            pt([q[6], q[7]]),
            pt([q[4], q[5]])
        ));
    }
    c.push_str("Q\n");

    Appearance { bbox, content: c.into_bytes(), opacity, multiply: true, uses_helvetica: false, matrix: None, gstates: Vec::new() }
}

/// Inner box padding, line height factor and first-baseline offset (fraction of
/// the font size below the padding); identical to the TS `textLayout` and the
/// overlay's FreeText rendering.
const TEXT_PADDING: f64 = 4.0;
const LINE_HEIGHT: f64 = 1.2;
const ASCENT: f64 = 0.8;

/// PDF literal string body: WinAnsi bytes with `(`, `)` and `\` escaped.
fn literal(s: &str) -> Vec<u8> {
    let mut out = Vec::new();
    for b in encode_winansi(s) {
        if matches!(b, b'(' | b')' | b'\\') {
            out.push(b'\\');
        }
        out.push(b);
    }
    out
}

/// Rotation part `[a b c d]` that turns the screen-aligned text frame so it reads
/// upright on a page with this `/Rotate` (clockwise); `None` for 0 and unknown values.
fn upright_rotation(page_rotation: i32) -> Option<[f64; 4]> {
    match page_rotation.rem_euclid(360) {
        90 => Some([0.0, 1.0, -1.0, 0.0]),
        180 => Some([-1.0, 0.0, 0.0, -1.0]),
        270 => Some([0.0, -1.0, 1.0, 0.0]),
        _ => None,
    }
}

/// FreeText appearance: optional background fill (its opacity is the `GS0`
/// opacity, so it applies to the fill only) and one opaque Helvetica (`/Helv`,
/// WinAnsiEncoding) line per entry of `lines`, `font_size * LINE_HEIGHT` apart,
/// the first baseline `TEXT_PADDING + font_size * ASCENT` below the top.
///
/// `rect` is axis-aligned in PDF space. On a page with `/Rotate` 90/180/270 the
/// text is laid out in the screen-aligned frame (width and height swapped for
/// 90/270), anchored at the rect's lower-left corner, and `matrix` rotates that
/// frame exactly onto `rect` so the text reads upright on screen, as the overlay
/// shows it. Unmappable characters are written as `?`.
pub fn freetext_appearance(
    rect: [f64; 4],
    lines: &[String],
    font_size: f64,
    text_color: [f64; 3],
    background: Option<&Background>,
    page_rotation: i32,
) -> Appearance {
    let (x1, y1) = (rect[0].min(rect[2]), rect[1].min(rect[3]));
    let (w, h) = ((rect[2] - rect[0]).abs(), (rect[3] - rect[1]).abs());
    let rotation = upright_rotation(page_rotation);
    let (fw, fh) = match page_rotation.rem_euclid(360) {
        90 | 270 => (h, w),
        _ => (w, h),
    };
    let bbox = [x1, y1, x1 + fw, y1 + fh];
    let matrix = rotation.map(|[a, b, c, d]| {
        let turned = transformed_bounds(bbox, [a, b, c, d, 0.0, 0.0]);
        [a, b, c, d, x1 - turned[0], y1 - turned[1]]
    });

    let rgb = |c: [f64; 3]| format!("{} {} {}", fmt_num(c[0]), fmt_num(c[1]), fmt_num(c[2]));
    let mut c: Vec<u8> = Vec::new();
    if let Some(bg) = background {
        c.extend_from_slice(
            format!(
                "q\n/GS0 gs\n{} rg\n{} {} {} {} re\nf\nQ\n",
                rgb(bg.color),
                fmt_num(x1),
                fmt_num(y1),
                fmt_num(fw),
                fmt_num(fh)
            )
            .as_bytes(),
        );
    }
    let baseline = y1 + fh - TEXT_PADDING - font_size * ASCENT;
    c.extend_from_slice(
        format!(
            "BT\n/Helv {} Tf\n{} rg\n{} {} Td\n",
            fmt_num(font_size),
            rgb(text_color),
            fmt_num(x1 + TEXT_PADDING),
            fmt_num(baseline)
        )
        .as_bytes(),
    );
    let lead = format!("0 {} Td\n", fmt_num(-font_size * LINE_HEIGHT));
    for (i, line) in lines.iter().enumerate() {
        if i > 0 {
            c.extend_from_slice(lead.as_bytes());
        }
        if !line.is_empty() {
            c.push(b'(');
            c.extend(literal(line));
            c.extend_from_slice(b") Tj\n");
        }
    }
    c.extend_from_slice(b"ET\n");

    Appearance {
        bbox,
        content: c,
        opacity: background.map_or(1.0, |b| b.opacity),
        multiply: false,
        uses_helvetica: true,
        matrix,
        gstates: Vec::new(),
    }
}

/// Bézier circle constant: control points at `KAPPA * r` approximate a quarter circle.
const KAPPA: f64 = 0.5523;

/// Closed outline of the shape in `rect` (normalised): a `re` rectangle, or
/// an ellipse of four cubic Béziers around the centre (radii w/2 and h/2).
fn shape_path(shape: ShapeKind, [x1, y1, x2, y2]: [f64; 4]) -> String {
    match shape {
        ShapeKind::Rect => format!("{} {} {} {} re\n", fmt_num(x1), fmt_num(y1), fmt_num(x2 - x1), fmt_num(y2 - y1)),
        ShapeKind::Circle => {
            let (cx, cy) = ((x1 + x2) / 2.0, (y1 + y2) / 2.0);
            let (rx, ry) = ((x2 - x1) / 2.0, (y2 - y1) / 2.0);
            let (kx, ky) = (KAPPA * rx, KAPPA * ry);
            let curve = |a: [f64; 2], b: [f64; 2], c: [f64; 2]| format!("{} {} {} c\n", pt(a), pt(b), pt(c));
            let mut out = format!("{} m\n", pt([cx + rx, cy]));
            out.push_str(&curve([cx + rx, cy + ky], [cx + kx, cy + ry], [cx, cy + ry]));
            out.push_str(&curve([cx - kx, cy + ry], [cx - rx, cy + ky], [cx - rx, cy]));
            out.push_str(&curve([cx - rx, cy - ky], [cx - kx, cy - ry], [cx, cy - ry]));
            out.push_str(&curve([cx + kx, cy - ry], [cx + rx, cy - ky], [cx + rx, cy]));
            out.push_str("h\n");
            out
        }
    }
}

/// Square/Circle appearance: the fill first (`/GSf`, its opacity as `/ca`),
/// then the border (`/GSs`, its opacity as `/CA`), so both have their own
/// opacity. `rect` is the geometric outline (centre of the stroke); `bbox` is
/// it expanded by half the border width plus 1.
pub fn shape_appearance(shape: ShapeKind, rect: [f64; 4], border: Option<&Stroke>, fill: Option<&Fill>) -> Appearance {
    let r = [rect[0].min(rect[2]), rect[1].min(rect[3]), rect[0].max(rect[2]), rect[1].max(rect[3])];
    let pad = border.map_or(0.0, |b| b.width / 2.0) + 1.0;
    let bbox = [r[0] - pad, r[1] - pad, r[2] + pad, r[3] + pad];
    let rgb = |c: [f64; 3]| format!("{} {} {}", fmt_num(c[0]), fmt_num(c[1]), fmt_num(c[2]));
    let path = shape_path(shape, r);
    let mut c = String::new();
    let mut gstates = Vec::new();
    if let Some(f) = fill {
        c.push_str(&format!("q\n/GSf gs\n{} rg\n{path}f\nQ\n", rgb(f.color)));
        gstates.push(NamedGState { name: "GSf", fill_opacity: Some(f.opacity), stroke_opacity: None });
    }
    if let Some(b) = border {
        c.push_str(&format!("q\n/GSs gs\n{} w\n{} RG\n{path}S\nQ\n", fmt_num(b.width), rgb(b.color)));
        gstates.push(NamedGState { name: "GSs", fill_opacity: None, stroke_opacity: Some(b.opacity) });
    }
    Appearance {
        bbox,
        content: c.into_bytes(),
        opacity: 1.0,
        multiply: false,
        uses_helvetica: false,
        matrix: None,
        gstates,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shape_appearance_rect_fill_then_stroke() {
        let border = Stroke { color: [1.0, 0.0, 0.0], width: 2.0, opacity: 0.5 };
        let fill = Fill { color: [0.0, 0.0, 1.0], opacity: 0.25 };
        let a = shape_appearance(ShapeKind::Rect, [30.0, 40.0, 10.0, 20.0], Some(&border), Some(&fill));
        assert_eq!(
            text(&a),
            "q\n/GSf gs\n0 0 1 rg\n10 20 20 20 re\nf\nQ\nq\n/GSs gs\n2 w\n1 0 0 RG\n10 20 20 20 re\nS\nQ\n"
        );
        assert_eq!(a.bbox, [8.0, 18.0, 32.0, 42.0]);
        assert_eq!(
            a.gstates,
            vec![
                NamedGState { name: "GSf", fill_opacity: Some(0.25), stroke_opacity: None },
                NamedGState { name: "GSs", fill_opacity: None, stroke_opacity: Some(0.5) },
            ]
        );
        let outline = shape_appearance(ShapeKind::Circle, [0.0, 0.0, 10.0, 10.0], Some(&border), None);
        assert_eq!(text(&outline).matches(" c\n").count(), 4);
        assert_eq!(outline.gstates.len(), 1);
    }

    #[test]
    fn freetext_appearance_layout() {
        let lines = vec!["a(b)".to_string(), String::new(), "c".to_string()];
        let bg = Background { color: [1.0, 1.0, 0.0], opacity: 0.5 };
        let a = freetext_appearance([10.0, 20.0, 110.0, 70.0], &lines, 10.0, [0.0, 0.0, 1.0], Some(&bg), 0);
        assert_eq!(
            text(&a),
            "q\n/GS0 gs\n1 1 0 rg\n10 20 100 50 re\nf\nQ\nBT\n/Helv 10 Tf\n0 0 1 rg\n14 58 Td\n(a\\(b\\)) Tj\n0 -12 Td\n0 -12 Td\n(c) Tj\nET\n"
        );
        assert_eq!(a.opacity, 0.5);
        assert!(a.uses_helvetica && !a.multiply);
        assert_eq!(a.bbox, [10.0, 20.0, 110.0, 70.0]);
        let plain = freetext_appearance([10.0, 20.0, 110.0, 70.0], &lines, 10.0, [0.0; 3], None, 0);
        assert!(text(&plain).starts_with("BT\n"));
        assert_eq!(plain.opacity, 1.0);
    }

    #[test]
    fn freetext_rotation_matrix_maps_frame_onto_rect() {
        let rect = [100.0, 500.0, 130.0, 700.0];
        let ninety = freetext_appearance(rect, &[], 12.0, [0.0; 3], None, 90);
        assert_eq!(ninety.matrix, Some([0.0, 1.0, -1.0, 0.0, 630.0, 400.0]));
        // Frame top-left (screen top-left) lands on the rect's min corner, which is
        // the top-left on screen for Rotate 90 (right = +y, down = +x).
        let m = ninety.matrix.unwrap();
        let (fx, fy) = (ninety.bbox[0], ninety.bbox[3]);
        assert_eq!((m[0] * fx + m[2] * fy + m[4], m[1] * fx + m[3] * fy + m[5]), (100.0, 500.0));
        assert_eq!(freetext_appearance(rect, &[], 12.0, [0.0; 3], None, -270).matrix, ninety.matrix);
        assert!(freetext_appearance(rect, &[], 12.0, [0.0; 3], None, 45).matrix.is_none());
    }

    fn text(a: &Appearance) -> String {
        String::from_utf8(a.content.clone()).unwrap()
    }

    #[test]
    fn highlight_appearance_uses_multiply() {
        let a = highlight_appearance(&[[0.0, 10.0, 10.0, 10.0, 0.0, 0.0, 10.0, 0.0]], [1.0, 0.5, 0.0], 0.4);
        assert!(a.multiply);
        assert_eq!(a.opacity, 0.4);
        assert!(!a.uses_helvetica);
        assert!(a.matrix.is_none());
        assert!(text(&a).contains("/GS0 gs\n"));
    }

    #[test]
    fn highlight_appearance_fills_each_quad_tl_tr_br_bl() {
        let a = highlight_appearance(
            &[
                [1.0, 20.0, 30.0, 20.0, 1.0, 10.0, 30.0, 10.0],
                [5.0, 8.0, 15.0, 8.0, 5.0, -2.0, 15.0, -2.0],
            ],
            [1.0, 0.5, 0.0],
            0.4,
        );
        assert_eq!(
            text(&a),
            "q\n1 0.5 0 rg\n/GS0 gs\n1 20 m\n30 20 l\n30 10 l\n1 10 l\nh\nf\n5 8 m\n15 8 l\n15 -2 l\n5 -2 l\nh\nf\nQ\n"
        );
        assert_eq!(a.bbox, [1.0, -2.0, 30.0, 20.0]);
    }

    #[test]
    fn ink_appearance_bbox_includes_half_width() {
        let a = ink_appearance(&[vec![[10.0, 10.0], [20.0, 10.0]]], [0.0; 3], 4.0, 1.0, false);
        assert_eq!(a.bbox, [7.0, 7.0, 23.0, 13.0]);
    }

    #[test]
    fn ink_appearance_contains_curve_ops() {
        let a = ink_appearance(&[vec![[0.0, 0.0], [10.0, 10.0], [20.0, 0.0]]], [1.0, 0.0, 0.0], 2.0, 1.0, false);
        let t = text(&a);
        assert!(t.contains(" c\n"));
        assert!(t.ends_with("S\nQ\n"));
        assert!(t.starts_with("q\n2 w\n1 J\n1 j\n1 0 0 RG\n/GS0 gs\n"));
        let b = ink_appearance(&[vec![[0.0, 0.0], [10.0, 0.0]]], [0.0; 3], 2.0, 1.0, false);
        assert!(text(&b).contains(" l\n"));
        assert!(!text(&b).contains(" c\n"));
    }

    #[test]
    fn ink_curve_is_cubic_of_midpoint_quadratic() {
        // p0=(0,0) c=(10,10) end=mid((10,10),(20,0))=(15,5)
        // c1 = (6.667,6.667); c2 = (15+2/3*(10-15), 5+2/3*(10-5)) = (11.667,8.333)
        let a = ink_appearance(&[vec![[0.0, 0.0], [10.0, 10.0], [20.0, 0.0]]], [0.0; 3], 2.0, 1.0, false);
        let t = text(&a);
        assert!(t.contains("0 0 m\n6.667 6.667 11.667 8.333 15 5 c\n20 0 l\nS\n"), "{t}");
    }

    #[test]
    fn ink_single_point_is_zero_length_line() {
        let a = ink_appearance(&[vec![[5.0, 6.0]]], [0.0; 3], 2.0, 1.0, false);
        assert!(text(&a).contains("5 6 m\n5 6 l\nS\n"));
    }

    #[test]
    fn ink_skips_empty_strokes() {
        let a = ink_appearance(&[vec![], vec![[1.0, 1.0], [2.0, 2.0]]], [0.0; 3], 2.0, 1.0, false);
        assert_eq!(text(&a).matches("S\n").count(), 1);
        let none = ink_appearance(&[], [0.0; 3], 2.0, 1.0, false);
        assert_eq!(none.bbox, [0.0; 4]);
    }

    #[test]
    fn ink_appearance_multiply_flag() {
        let a = ink_appearance(&[vec![[0.0, 0.0]]], [0.0; 3], 2.0, 0.5, true);
        assert!(a.multiply);
        assert_eq!(a.opacity, 0.5);
        assert!(!a.uses_helvetica);
        assert!(a.matrix.is_none());
    }

    #[test]
    fn ink_four_points_second_segment_starts_at_midpoint() {
        let a = ink_appearance(&[vec![[0.0, 0.0], [10.0, 0.0], [20.0, 10.0], [30.0, 10.0]]], [0.0; 3], 2.0, 1.0, false);
        let t = text(&a);
        // first end = mid(p1,p2) = (15,5); second curve: c = p2, p0' = (15,5), end = mid(p2,p3) = (25,10)
        // c1 = 15+2/3*(20-15), 5+2/3*(10-5) = 18.333 8.333; c2 = 25+2/3*(20-25), 10+2/3*(10-10) = 21.667 10
        assert!(t.contains("15 5 c
18.333 8.333 21.667 10 25 10 c
30 10 l
S
"), "{t}");
        assert_eq!(t.matches(" c
").count(), 2);
    }
}
