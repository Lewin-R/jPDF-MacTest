// Saving pipeline building blocks. Nothing here is wired to a Tauri command yet
// (Task 16 does that), hence the `dead_code` allowances in the submodules.
pub mod appearance;
#[allow(dead_code)] // consumed by the save command in Task 16
pub mod dto;
pub mod fmt;
pub mod winansi;
