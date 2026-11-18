/// Formats a number for a PDF content stream: at most 3 decimals, trailing
/// zeros trimmed, never exponent notation, and "-0" becomes "0".
#[allow(dead_code)] // used by ink_appearance; reused by freetext/highlight appearances later
pub fn fmt_num(v: f64) -> String {
    if !v.is_finite() {
        return "0".to_string();
    }
    let mut s = format!("{:.3}", v);
    if s.contains('.') {
        while s.ends_with('0') {
            s.pop();
        }
        if s.ends_with('.') {
            s.pop();
        }
    }
    if s == "-0" { "0".to_string() } else { s }
}

#[cfg(test)]
mod tests {
    use super::fmt_num;

    #[test]
    fn trims_and_rounds() {
        assert_eq!(fmt_num(1.0), "1");
        assert_eq!(fmt_num(1.5), "1.5");
        assert_eq!(fmt_num(1.23456), "1.235");
        assert_eq!(fmt_num(0.1 + 0.2), "0.3");
        assert_eq!(fmt_num(100.0), "100");
    }

    #[test]
    fn negative_zero_and_tiny() {
        assert_eq!(fmt_num(-0.0), "0");
        assert_eq!(fmt_num(-0.0004), "0");
        assert_eq!(fmt_num(-2.5), "-2.5");
    }

    #[test]
    fn no_exponent_for_extremes() {
        assert_eq!(fmt_num(1e-10), "0");
        assert_eq!(fmt_num(1e7), "10000000");
        assert_eq!(fmt_num(f64::NAN), "0");
    }
}
