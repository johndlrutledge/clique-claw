#![no_main]

use libfuzzer_sys::fuzz_target;
use arbitrary::Arbitrary;
use clique_core::{is_inside_workspace, get_validated_path};

#[derive(Arbitrary, Debug)]
struct PathValidationInput {
    path: String,
    workspace: String,
}

fuzz_target!(|input: PathValidationInput| {
    // Path validation should never panic
    let _ = is_inside_workspace(&input.path, &input.workspace);
    let _ = get_validated_path(&input.path, &input.workspace);
});
