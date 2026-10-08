use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ReleaseNotes {
    pub version: String,
    pub items: Vec<String>,
}

pub fn parse_items(raw: &str) -> Vec<String> {
    raw.lines()
        .filter_map(|line| line.trim().strip_prefix("- "))
        .map(str::trim)
        .filter(|item| !item.is_empty())
        .map(String::from)
        .collect()
}

pub fn build(version: &str, raw: Option<&str>) -> Option<ReleaseNotes> {
    let items = parse_items(raw?);
    if items.is_empty() {
        return None;
    }
    Some(ReleaseNotes {
        version: version.to_string(),
        items,
    })
}

pub fn current() -> Option<ReleaseNotes> {
    build(
        env!("CARGO_PKG_VERSION"),
        option_env!("TOPIC_LAB_RELEASE_NOTES"),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_bullet_lines() {
        let raw = "- Multiple windows (Cmd+N)\n- Release notes after updating\n";
        assert_eq!(
            parse_items(raw),
            vec!["Multiple windows (Cmd+N)", "Release notes after updating"]
        );
    }

    #[test]
    fn ignores_non_bullet_lines_and_blank_items() {
        let raw = "v0.5.0\n\n- First\nnot a bullet\n-   \n  - Indented\n-missing space\n";
        assert_eq!(parse_items(raw), vec!["First", "Indented"]);
    }

    #[test]
    fn handles_crlf_line_endings() {
        assert_eq!(parse_items("- One\r\n- Two\r\n"), vec!["One", "Two"]);
    }

    #[test]
    fn build_returns_none_without_notes() {
        assert_eq!(build("1.0.0", None), None);
        assert_eq!(build("1.0.0", Some("")), None);
        assert_eq!(build("1.0.0", Some("no bullets here")), None);
    }

    #[test]
    fn build_attaches_version() {
        assert_eq!(
            build("1.2.3", Some("- Fixed a bug")),
            Some(ReleaseNotes {
                version: "1.2.3".into(),
                items: vec!["Fixed a bug".into()],
            })
        );
    }
}
