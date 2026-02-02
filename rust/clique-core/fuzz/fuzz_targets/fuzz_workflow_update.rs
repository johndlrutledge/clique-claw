#![no_main]

use libfuzzer_sys::fuzz_target;
use arbitrary::Arbitrary;
use clique_core::update_workflow_status;

#[derive(Arbitrary, Debug)]
struct WorkflowUpdateInput {
    yaml: String,
    item_id: String,
    new_status: String,
}

fuzz_target!(|input: WorkflowUpdateInput| {
    // The update function should never panic
    let _ = update_workflow_status(&input.yaml, &input.item_id, &input.new_status);
});
