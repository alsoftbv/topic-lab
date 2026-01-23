use regex::Regex;
use std::collections::HashMap;

pub fn substitute_variables(template: &str, variables: &HashMap<String, String>) -> String {
    let re = Regex::new(r"\{([a-zA-Z_][a-zA-Z0-9_]*)\}").unwrap();
    let mut result = template.to_string();
    let max_iterations = 10;

    for _ in 0..max_iterations {
        let new_result = re
            .replace_all(&result, |caps: &regex::Captures| {
                let var_name = &caps[1];
                variables
                    .get(var_name)
                    .cloned()
                    .unwrap_or_else(|| format!("{{{}}}", var_name))
            })
            .to_string();

        if new_result == result {
            break;
        }
        result = new_result;
    }

    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_substitute_single_variable() {
        let mut vars = HashMap::new();
        vars.insert("device_id".to_string(), "abc123".to_string());

        let result = substitute_variables("devices/{device_id}/CMD", &vars);
        assert_eq!(result, "devices/abc123/CMD");
    }

    #[test]
    fn test_substitute_multiple_variables() {
        let mut vars = HashMap::new();
        vars.insert("device_id".to_string(), "abc123".to_string());
        vars.insert("sensor".to_string(), "temp".to_string());

        let result = substitute_variables("devices/{device_id}/sensors/{sensor}/value", &vars);
        assert_eq!(result, "devices/abc123/sensors/temp/value");
    }

    #[test]
    fn test_substitute_same_variable_multiple_times() {
        let mut vars = HashMap::new();
        vars.insert("id".to_string(), "123".to_string());

        let result = substitute_variables("{id}/request/{id}/response", &vars);
        assert_eq!(result, "123/request/123/response");
    }

    #[test]
    fn test_substitute_missing_variable_keeps_placeholder() {
        let vars = HashMap::new();

        let result = substitute_variables("devices/{device_id}/CMD", &vars);
        assert_eq!(result, "devices/{device_id}/CMD");
    }

    #[test]
    fn test_substitute_partial_variables() {
        let mut vars = HashMap::new();
        vars.insert("device_id".to_string(), "abc123".to_string());

        let result = substitute_variables("devices/{device_id}/{missing}/CMD", &vars);
        assert_eq!(result, "devices/abc123/{missing}/CMD");
    }

    #[test]
    fn test_substitute_no_variables() {
        let vars = HashMap::new();

        let result = substitute_variables("devices/static/topic", &vars);
        assert_eq!(result, "devices/static/topic");
    }

    #[test]
    fn test_substitute_empty_template() {
        let mut vars = HashMap::new();
        vars.insert("test".to_string(), "value".to_string());

        let result = substitute_variables("", &vars);
        assert_eq!(result, "");
    }

    #[test]
    fn test_substitute_with_underscores() {
        let mut vars = HashMap::new();
        vars.insert("device_type_id".to_string(), "sensor_01".to_string());

        let result = substitute_variables("devices/{device_type_id}/data", &vars);
        assert_eq!(result, "devices/sensor_01/data");
    }

    #[test]
    fn test_nested_variables() {
        let mut vars = HashMap::new();
        vars.insert("mac".to_string(), "12341234".to_string());
        vars.insert("command".to_string(), "cmd/{mac}/action".to_string());

        let result = substitute_variables("{command}", &vars);
        assert_eq!(result, "cmd/12341234/action");
    }
}
