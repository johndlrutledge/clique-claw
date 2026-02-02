#![no_main]

use clique_core::parse_workflow_status;
use libfuzzer_sys::fuzz_target;

fuzz_target!(|data: &[u8]| {
    // Convert bytes to string (lossy - replaces invalid UTF-8)
    let yaml = String::from_utf8_lossy(data);

    // The parser should never panic, only return Ok or Err
    let _ = parse_workflow_status(&yaml);
});
