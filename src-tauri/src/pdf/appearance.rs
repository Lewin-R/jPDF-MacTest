use super::fmt::fmt_num;

/// An appearance stream description, built independent of lopdf.
///
/// `content` uses absolute PDF user-space coordinates (no translation), so the
/// writer must set the form XObject `/BBox` = `bbox` with an identity `/Matrix`
/// (unless `matrix` is set) and the annotation `/Rect` = `bbox`.
/// The writer builds the `/ExtGState` resource `GS0` from `opacity` (`/CA`, `/ca`)
/// and `multiply` (`/BM /Multiply`), and a Helvetica font resource if `uses_helvetica`.
#[derive(Clone, Debug, PartialEq)]
pub struct Appearance {
    pub bbox: [f64; 4],
    pub content: Vec<u8>,
    pub opacity: f64,
    pub multiply: bool,
    pub uses_helvetica: bool,
    pub matrix: Option<[f64; 6]>,
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

    Appearance { bbox, content: c.into_bytes(), opacity, multiply, uses_helvetica: false, matrix: None }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn text(a: &Appearance) -> String {
        String::from_utf8(a.content.clone()).unwrap()
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
