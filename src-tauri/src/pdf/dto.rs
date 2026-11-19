use serde::{Deserialize, Serialize};

/// JSON shape is identical to the TS model in `src/core/session/model.ts`.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Common {
    pub id: String,
    pub page: u32,
    pub source_ref: Option<String>,
    pub modified_at: String,
    pub author: String,
}

/// An annotation deleted in the app: the writer only detaches `source_ref`
/// if that object is still the annotation `id` was read as.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DeleteRef {
    pub id: String,
    pub source_ref: String,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Blend {
    Normal,
    Multiply,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum InkRole {
    Pen,
    Marker,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Background {
    pub color: [f64; 3],
    pub opacity: f64,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(tag = "kind", rename_all = "lowercase", rename_all_fields = "camelCase")]
pub enum AnnotationDto {
    Highlight {
        #[serde(flatten)]
        common: Common,
        quads: Vec<[f64; 8]>,
        color: [f64; 3],
        opacity: f64,
    },
    Ink {
        #[serde(flatten)]
        common: Common,
        strokes: Vec<Vec<[f64; 2]>>,
        color: [f64; 3],
        width: f64,
        opacity: f64,
        blend: Blend,
        role: InkRole,
    },
    Freetext {
        #[serde(flatten)]
        common: Common,
        rect: [f64; 4],
        text: String,
        lines: Vec<String>,
        font_size: f64,
        text_color: [f64; 3],
        background: Option<Background>,
    },
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{Value, json};

    /// JS has one number type; compare numbers as f64 so `1` equals `1.0`.
    fn norm(v: Value) -> Value {
        match v {
            Value::Number(n) => json!(n.as_f64().unwrap()),
            Value::Array(a) => Value::Array(a.into_iter().map(norm).collect()),
            Value::Object(o) => Value::Object(o.into_iter().map(|(k, v)| (k, norm(v))).collect()),
            other => other,
        }
    }

    fn roundtrip(src: &str) -> (AnnotationDto, Value, Value) {
        let dto: AnnotationDto = serde_json::from_str(src).unwrap();
        let out = serde_json::to_value(&dto).unwrap();
        (dto, norm(out), norm(serde_json::from_str(src).unwrap()))
    }

    #[test]
    fn dto_json_matches_ts_shape() {
        let src = r#"{"kind":"ink","id":"a","page":0,"sourceRef":null,"modifiedAt":"2026-11-18T10:00:00Z","author":"JuliePDF","strokes":[[[0,0],[10,0]]],"color":[1,0,0],"width":2,"opacity":1,"blend":"normal","role":"pen"}"#;
        let (dto, out, orig) = roundtrip(src);
        assert!(matches!(dto, AnnotationDto::Ink { .. }));
        assert_eq!(out, orig);
    }

    #[test]
    fn dto_freetext_camel_case_roundtrip() {
        let src = r#"{"kind":"freetext","id":"f","page":2,"sourceRef":"12R3","modifiedAt":"2026-11-18T10:00:00Z","author":"J","rect":[1,2,3,4],"text":"a\nb","lines":["a","b"],"fontSize":12,"textColor":[0,0,0],"background":{"color":[1,1,0],"opacity":0.5}}"#;
        let (dto, out, orig) = roundtrip(src);
        assert!(matches!(dto, AnnotationDto::Freetext { font_size, .. } if font_size == 12.0));
        assert_eq!(out, orig);
    }

    #[test]
    fn dto_highlight_roundtrip() {
        let src = r#"{"kind":"highlight","id":"h","page":1,"sourceRef":null,"modifiedAt":"t","author":"J","quads":[[0,10,10,10,0,0,10,0]],"color":[1,1,0],"opacity":0.4}"#;
        let (dto, out, orig) = roundtrip(src);
        assert!(matches!(dto, AnnotationDto::Highlight { .. }));
        assert_eq!(out, orig);
    }

    #[test]
    fn dto_roundtrip_is_exact_for_non_dyadic_values() {
        let src = r#"{"kind":"ink","id":"a","page":0,"sourceRef":null,"modifiedAt":"t","author":"J","strokes":[[[123.456789,0.1]]],"color":[0.4,0.2,0.7],"width":2.5,"opacity":0.4,"blend":"multiply","role":"marker"}"#;
        let dto: AnnotationDto = serde_json::from_str(src).unwrap();
        let out = serde_json::to_value(&dto).unwrap();
        assert_eq!(out, serde_json::from_str::<Value>(src).unwrap());
    }
}
