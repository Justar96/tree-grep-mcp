// Sample Rust file for integration tests

fn add(a: i32, b: i32) -> i32 {
    a + b
}

fn multiply(x: i32, y: i32) -> i32 {
    x * y
}

fn calculate_sum(numbers: &[i32]) -> i32 {
    numbers.iter().sum()
}

fn main() {
    println!("Hello, world!");
    let result = add(5, 3);
    println!("Result: {}", result);
}

struct Point {
    x: i32,
    y: i32,
}

impl Point {
    fn new(x: i32, y: i32) -> Point {
        Point { x, y }
    }
}
