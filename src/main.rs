use std::env;
use std::path::PathBuf;
use std::process::Command;

fn main() {
    // Get the current executable's path
    let exe_path = env::current_exe().expect("Failed to get current executable path");

    // Construct the path to the `server.py` script
    let script_path = PathBuf::from(exe_path.parent().expect("Failed to get parent directory"))
        .join("backend")
        .join("server.py");

    // Run the Python script using the `python` command
    let mut command = Command::new("python");
    command.arg(script_path); // Updated path to the script

    // Execute the command and capture its output
    match command.output() {
        Ok(output) => {
            if output.status.success() {
                println!("Python script output: {}", String::from_utf8_lossy(&output.stdout));
            } else {
                eprintln!("Error running Python script: {}", String::from_utf8_lossy(&output.stderr));
            }
        }
        Err(error) => {
            eprintln!("Failed to run Python script: {}", error);
        }
    }
}