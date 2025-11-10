function greet(name) {
  console.log(`Hello, ${name}!`);
}

function add(a, b) {
  return a + b;
}

function multiply(a, b) {
  return a * b;
}

class Calculator {
  constructor() {
    this.result = 0;
  }

  add(value) {
    this.result += value;
    return this;
  }

  multiply(value) {
    this.result *= value;
    return this;
  }

  getResult() {
    return this.result;
  }
}

// Usage examples
greet("World");
const calc = new Calculator();
calc.add(5).multiply(2);
console.log(`Result: ${calc.getResult()}`);
