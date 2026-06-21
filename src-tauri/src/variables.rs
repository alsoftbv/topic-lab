use chrono::{DateTime, Datelike, Duration, Local, NaiveDate, Timelike, Utc};
use regex::{Captures, Regex};
use std::collections::HashMap;
use std::sync::OnceLock;

const BUILTIN_NAMES: &[&str] = &["now", "timestamp", "uuid", "random", "rand"];

pub fn builtin_names() -> Vec<String> {
    BUILTIN_NAMES.iter().map(|s| s.to_string()).collect()
}

pub fn is_builtin(name: &str) -> bool {
    BUILTIN_NAMES.contains(&name)
}

fn pattern() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"\{([a-zA-Z_][a-zA-Z0-9_]*(?::[^}]+)?)\}").unwrap())
}

fn parse_variable_expression(expression: &str) -> (String, Vec<String>) {
    let parts: Vec<&str> = expression.split(':').collect();
    let name = parts[0].to_string();
    let mut modifiers = Vec::new();
    let mut i = 1;
    while i < parts.len() {
        // Everything from `fmt:` onward is a single modifier — the format pattern
        // itself may contain colons (e.g. `fmt:HH:mm:ss`).
        if parts[i] == "fmt" {
            modifiers.push(parts[i..].join(":"));
            break;
        }
        modifiers.push(parts[i].to_string());
        i += 1;
    }
    (name, modifiers)
}

pub fn substitute_variables(template: &str, variables: &HashMap<String, String>) -> String {
    let re = pattern();
    let mut result = template.to_string();
    let mut prev = String::new();
    let mut iterations = 0;

    while result != prev && iterations < 10 {
        prev = result.clone();
        result = re
            .replace_all(&result, |caps: &Captures| {
                let expression = &caps[1];
                let (name, modifiers) = parse_variable_expression(expression);

                if is_builtin(&name) {
                    if let Some(resolved) = resolve_builtin(&name, &modifiers) {
                        return resolved;
                    }
                }

                if modifiers.is_empty() {
                    if let Some(value) = variables.get(&name) {
                        return value.clone();
                    }
                }

                caps[0].to_string()
            })
            .into_owned();
        iterations += 1;
    }

    result
}

pub fn resolve_builtin(name: &str, modifiers: &[String]) -> Option<String> {
    match name.to_lowercase().as_str() {
        "now" | "timestamp" => Some(handle_now(modifiers)),
        "uuid" => Some(handle_uuid()),
        "random" | "rand" => Some(handle_random(modifiers)),
        _ => None,
    }
}

fn handle_uuid() -> String {
    uuid::Uuid::new_v4().to_string()
}

fn handle_random(modifiers: &[String]) -> String {
    static RANGE: OnceLock<Regex> = OnceLock::new();
    let range = RANGE.get_or_init(|| Regex::new(r"^(\d+)-(\d+)$").unwrap());

    let mut min: i64 = 0;
    let mut max: i64 = 100;
    for modifier in modifiers {
        if let Some(caps) = range.captures(modifier) {
            min = caps[1].parse().unwrap_or(0);
            max = caps[2].parse().unwrap_or(100);
            break;
        }
    }

    if max < min {
        std::mem::swap(&mut min, &mut max);
    }
    use rand::Rng;
    rand::thread_rng().gen_range(min..=max).to_string()
}

#[derive(Clone, Copy, PartialEq)]
enum TimeFormat {
    Iso,
    Unix,
    UnixMs,
    Date,
    Time,
    DateTime,
}

struct ParsedModifiers {
    offset: Option<(i64, char)>,
    use_utc: bool,
    format: Option<TimeFormat>,
    custom_format: Option<String>,
}

fn parse_offset(modifier: &str) -> Option<(i64, char)> {
    static RE: OnceLock<Regex> = OnceLock::new();
    let re = RE.get_or_init(|| Regex::new(r"^([+-])(\d+)([smhdwMy])$").unwrap());
    let caps = re.captures(modifier)?;
    let sign = if &caps[1] == "-" { -1 } else { 1 };
    let amount: i64 = caps[2].parse().ok()?;
    let unit = caps[3].chars().next()?;
    Some((amount * sign, unit))
}

fn parse_modifiers(modifiers: &[String]) -> ParsedModifiers {
    let mut result = ParsedModifiers {
        offset: None,
        use_utc: false,
        format: None,
        custom_format: None,
    };

    for modifier in modifiers {
        let lower = modifier.to_lowercase();

        if lower == "utc" {
            result.use_utc = true;
            continue;
        }
        if lower == "local" {
            result.use_utc = false;
            continue;
        }

        result.format = match lower.as_str() {
            "iso" => Some(TimeFormat::Iso),
            "unix" => Some(TimeFormat::Unix),
            "unixms" => Some(TimeFormat::UnixMs),
            "date" => Some(TimeFormat::Date),
            "time" => Some(TimeFormat::Time),
            "datetime" => Some(TimeFormat::DateTime),
            _ => result.format,
        };
        if matches!(
            lower.as_str(),
            "iso" | "unix" | "unixms" | "date" | "time" | "datetime"
        ) {
            continue;
        }

        if let Some(custom) = modifier.strip_prefix("fmt:") {
            result.custom_format = Some(custom.to_string());
            continue;
        }

        if let Some(offset) = parse_offset(modifier) {
            result.offset = Some(offset);
        }
    }

    result
}

fn days_in_month(year: i32, month: u32) -> u32 {
    match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 => {
            if (year % 4 == 0 && year % 100 != 0) || year % 400 == 0 {
                29
            } else {
                28
            }
        }
        _ => 30,
    }
}

fn add_months(dt: DateTime<Utc>, months: i64) -> DateTime<Utc> {
    let time = dt.time();
    let total = dt.year() as i64 * 12 + dt.month0() as i64 + months;
    let mut year = total.div_euclid(12) as i32;
    let mut month = total.rem_euclid(12) as u32 + 1;
    let day = dt.day();

    let dim = days_in_month(year, month);
    let day = if day <= dim {
        day
    } else {
        let overflow = day - dim;
        month += 1;
        if month > 12 {
            month = 1;
            year += 1;
        }
        overflow
    };

    let date = NaiveDate::from_ymd_opt(year, month, day).unwrap_or(dt.date_naive());
    DateTime::from_naive_utc_and_offset(date.and_time(time), Utc)
}

fn apply_offset(dt: DateTime<Utc>, amount: i64, unit: char) -> DateTime<Utc> {
    match unit {
        's' => dt + Duration::seconds(amount),
        'm' => dt + Duration::minutes(amount),
        'h' => dt + Duration::hours(amount),
        'd' => dt + Duration::days(amount),
        'w' => dt + Duration::days(amount * 7),
        'M' => add_months(dt, amount),
        'y' => add_months(dt, amount * 12),
        _ => dt,
    }
}

fn format_date(dt: DateTime<Utc>, format: TimeFormat, use_utc: bool) -> String {
    match format {
        TimeFormat::Unix => dt.timestamp().to_string(),
        TimeFormat::UnixMs => dt.timestamp_millis().to_string(),
        TimeFormat::Date => {
            if use_utc {
                dt.format("%Y-%m-%d").to_string()
            } else {
                dt.with_timezone(&Local).format("%Y-%m-%d").to_string()
            }
        }
        TimeFormat::Time => {
            if use_utc {
                dt.format("%H:%M:%S").to_string()
            } else {
                dt.with_timezone(&Local).format("%H:%M:%S").to_string()
            }
        }
        TimeFormat::DateTime => {
            if use_utc {
                dt.format("%Y-%m-%d %H:%M:%S").to_string()
            } else {
                dt.with_timezone(&Local)
                    .format("%Y-%m-%d %H:%M:%S")
                    .to_string()
            }
        }
        TimeFormat::Iso => {
            if use_utc {
                dt.format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string()
            } else {
                dt.format("%Y-%m-%dT%H:%M:%S%.3f").to_string()
            }
        }
    }
}

fn format_custom(dt: DateTime<Utc>, pattern: &str, use_utc: bool) -> String {
    let local = dt.with_timezone(&Local);
    let (year, month, day, hours, minutes, seconds, ms) = if use_utc {
        (
            dt.year(),
            dt.month(),
            dt.day(),
            dt.hour(),
            dt.minute(),
            dt.second(),
            dt.timestamp_subsec_millis(),
        )
    } else {
        (
            local.year(),
            local.month(),
            local.day(),
            local.hour(),
            local.minute(),
            local.second(),
            local.timestamp_subsec_millis(),
        )
    };

    pattern
        .replacen("YYYY", &year.to_string(), 1)
        .replacen("YY", &format!("{:02}", year % 100), 1)
        .replacen("MM", &format!("{:02}", month), 1)
        .replacen("M", &month.to_string(), 1)
        .replacen("DD", &format!("{:02}", day), 1)
        .replacen("D", &day.to_string(), 1)
        .replacen("HH", &format!("{:02}", hours), 1)
        .replacen("H", &hours.to_string(), 1)
        .replacen("mm", &format!("{:02}", minutes), 1)
        .replacen("ss", &format!("{:02}", seconds), 1)
        .replacen("SSS", &format!("{:03}", ms), 1)
}

fn handle_now(modifiers: &[String]) -> String {
    now_at(Utc::now(), modifiers)
}

fn now_at(now: DateTime<Utc>, modifiers: &[String]) -> String {
    let parsed = parse_modifiers(modifiers);
    let mut date = now;

    if let Some((amount, unit)) = parsed.offset {
        date = apply_offset(date, amount, unit);
    }

    if let Some(ref custom) = parsed.custom_format {
        return format_custom(date, custom, parsed.use_utc);
    }

    format_date(date, parsed.format.unwrap_or(TimeFormat::Iso), parsed.use_utc)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn vars(pairs: &[(&str, &str)]) -> HashMap<String, String> {
        pairs
            .iter()
            .map(|(k, v)| (k.to_string(), v.to_string()))
            .collect()
    }

    fn fixed() -> DateTime<Utc> {
        "2024-06-15T10:30:45.123Z".parse().unwrap()
    }

    #[test]
    fn substitutes_single_variable() {
        assert_eq!(
            substitute_variables("devices/{device_id}/CMD", &vars(&[("device_id", "abc123")])),
            "devices/abc123/CMD"
        );
    }

    #[test]
    fn substitutes_multiple_variables() {
        assert_eq!(
            substitute_variables(
                "devices/{device_id}/sensors/{sensor}/value",
                &vars(&[("device_id", "abc123"), ("sensor", "temp")])
            ),
            "devices/abc123/sensors/temp/value"
        );
    }

    #[test]
    fn substitutes_repeated_variable() {
        assert_eq!(
            substitute_variables("{id}/request/{id}/response", &vars(&[("id", "123")])),
            "123/request/123/response"
        );
    }

    #[test]
    fn keeps_missing_variable_placeholder() {
        assert_eq!(
            substitute_variables("devices/{device_id}/CMD", &vars(&[])),
            "devices/{device_id}/CMD"
        );
    }

    #[test]
    fn substitutes_found_keeps_missing() {
        assert_eq!(
            substitute_variables(
                "devices/{device_id}/{missing}/CMD",
                &vars(&[("device_id", "abc123")])
            ),
            "devices/abc123/{missing}/CMD"
        );
    }

    #[test]
    fn handles_empty_template() {
        assert_eq!(substitute_variables("", &vars(&[("test", "value")])), "");
    }

    #[test]
    fn does_not_substitute_invalid_names() {
        assert_eq!(
            substitute_variables(
                "{123invalid}/{valid_name}",
                &vars(&[("123invalid", "bad"), ("valid_name", "good")])
            ),
            "{123invalid}/good"
        );
    }

    #[test]
    fn preserves_mqtt_wildcards() {
        assert_eq!(
            substitute_variables(
                "{prefix}/devices/{device_id}/+/sensors/#",
                &vars(&[("prefix", "home"), ("device_id", "living-room")])
            ),
            "home/devices/living-room/+/sensors/#"
        );
    }

    #[test]
    fn does_not_substitute_partial_matches() {
        assert_eq!(
            substitute_variables("{device_id_extended}", &vars(&[("device_id", "abc")])),
            "{device_id_extended}"
        );
    }

    #[test]
    fn handles_adjacent_variables() {
        assert_eq!(
            substitute_variables("{a}{b}{c}", &vars(&[("a", "1"), ("b", "2"), ("c", "3")])),
            "123"
        );
    }

    #[test]
    fn handles_empty_variable_value() {
        assert_eq!(
            substitute_variables("devices/{id}/data", &vars(&[("id", "")])),
            "devices//data"
        );
    }

    #[test]
    fn now_default_is_utc_iso_without_z() {
        assert_eq!(now_at(fixed(), &[]), "2024-06-15T10:30:45.123");
    }

    #[test]
    fn now_utc_iso_with_z() {
        assert_eq!(
            now_at(fixed(), &["utc".into()]),
            "2024-06-15T10:30:45.123Z"
        );
    }

    #[test]
    fn now_utc_date_time_datetime() {
        assert_eq!(now_at(fixed(), &["utc".into(), "date".into()]), "2024-06-15");
        assert_eq!(now_at(fixed(), &["utc".into(), "time".into()]), "10:30:45");
        assert_eq!(
            now_at(fixed(), &["utc".into(), "datetime".into()]),
            "2024-06-15 10:30:45"
        );
    }

    #[test]
    fn now_unix_and_unixms() {
        assert_eq!(now_at(fixed(), &["unix".into()]), "1718447445");
        assert_eq!(now_at(fixed(), &["unixms".into()]), "1718447445123");
    }

    #[test]
    fn now_offsets() {
        assert_eq!(
            now_at(fixed(), &["utc".into(), "+2h".into(), "datetime".into()]),
            "2024-06-15 12:30:45"
        );
        assert_eq!(
            now_at(fixed(), &["utc".into(), "-1h".into(), "datetime".into()]),
            "2024-06-15 09:30:45"
        );
        assert_eq!(
            now_at(fixed(), &["utc".into(), "+30m".into(), "datetime".into()]),
            "2024-06-15 11:00:45"
        );
        assert_eq!(
            now_at(fixed(), &["utc".into(), "-1d".into(), "date".into()]),
            "2024-06-14"
        );
        assert_eq!(
            now_at(fixed(), &["utc".into(), "+1w".into(), "date".into()]),
            "2024-06-22"
        );
        assert_eq!(
            now_at(fixed(), &["utc".into(), "-1M".into(), "date".into()]),
            "2024-05-15"
        );
        assert_eq!(
            now_at(fixed(), &["utc".into(), "+1y".into(), "date".into()]),
            "2025-06-15"
        );
    }

    #[test]
    fn now_unix_with_offset() {
        let expected = (fixed() - Duration::minutes(10)).timestamp().to_string();
        assert_eq!(
            now_at(fixed(), &["utc".into(), "unix".into(), "-10m".into()]),
            expected
        );
    }

    #[test]
    fn now_custom_format_via_joined_modifier() {
        assert_eq!(
            now_at(fixed(), &["utc".into(), "fmt:YYYY/MM/DD".into()]),
            "2024/06/15"
        );
        assert_eq!(
            now_at(fixed(), &["utc".into(), "fmt:YYYY-MM-DD HH:mm:ss".into()]),
            "2024-06-15 10:30:45"
        );
        assert_eq!(
            now_at(fixed(), &["utc".into(), "fmt:HH:mm:ss.SSS".into()]),
            "10:30:45.123"
        );
        assert_eq!(
            now_at(fixed(), &["utc".into(), "-1h".into(), "fmt:HH:mm".into()]),
            "09:30"
        );
    }

    #[test]
    fn parse_keeps_fmt_pattern_intact() {
        let (name, mods) = parse_variable_expression("now:utc:fmt:YYYY-MM-DD HH:mm:ss");
        assert_eq!(name, "now");
        assert_eq!(
            mods,
            vec!["utc".to_string(), "fmt:YYYY-MM-DD HH:mm:ss".to_string()]
        );
    }

    #[test]
    fn substitution_path_applies_fmt() {
        let out = substitute_variables("{now:utc:fmt:YYYY-MM-DD}", &vars(&[]));
        assert!(
            Regex::new(r"^\d{4}-\d{2}-\d{2}$").unwrap().is_match(&out),
            "fmt should apply via substitution path, got {out}"
        );
        let out2 = substitute_variables("{now:utc:fmt:HH:mm:ss}", &vars(&[]));
        assert!(
            Regex::new(r"^\d{2}:\d{2}:\d{2}$").unwrap().is_match(&out2),
            "fmt with colons in the pattern should apply, got {out2}"
        );
    }

    #[test]
    fn uuid_format_is_valid_v4() {
        let re = Regex::new(
            r"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
        )
        .unwrap();
        let out = substitute_variables("{uuid}", &vars(&[]));
        assert!(re.is_match(&out), "got {out}");
    }

    #[test]
    fn random_default_range() {
        for _ in 0..50 {
            let n: i64 = substitute_variables("{random}", &vars(&[])).parse().unwrap();
            assert!((0..=100).contains(&n));
        }
    }

    #[test]
    fn random_custom_range() {
        for _ in 0..50 {
            let n: i64 = resolve_builtin("random", &["1-10".into()])
                .unwrap()
                .parse()
                .unwrap();
            assert!((1..=10).contains(&n));
        }
    }

    #[test]
    fn is_builtin_matches_lowercase_names_only() {
        assert!(is_builtin("now"));
        assert!(is_builtin("uuid"));
        assert!(!is_builtin("NOW"));
        assert!(!is_builtin("device_id"));
    }

    #[test]
    fn resolve_builtin_returns_none_for_unknown() {
        assert!(resolve_builtin("device_id", &[]).is_none());
    }
}
