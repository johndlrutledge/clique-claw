#![no_main]

use libfuzzer_sys::fuzz_target;
use arbitrary::Arbitrary;
use clique_core::update_story_status;

#[derive(Arbitrary, Debug)]
struct StoryUpdateInput {
    yaml: String,
    story_id: String,
    new_status: String,
}

fuzz_target!(|input: StoryUpdateInput| {
    // The update function should never panic
    let _ = update_story_status(&input.yaml, &input.story_id, &input.new_status);
});
