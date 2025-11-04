// Manual testing sample file
// Various JavaScript patterns for comprehensive testing

// Basic function calls
console.log("Hello World");
console.error("Error message");
console.warn("Warning");
logger.info("Info message");

// Variable declarations
var oldStyle = 1;
var anotherOld = 2;
const modern = 3;
let mutable = 4;

// Function definitions
function add(a, b) {
  return a + b;
}

function multiply(x, y) {
  return x * y;
}

const arrow = (p1, p2) => p1 + p2;

// Object methods
const obj = {
  method1: function(arg) {
    console.log(arg);
  },
  method2(arg) {
    return arg * 2;
  }
};

// Async functions
async function fetchData(url) {
  const response = await fetch(url);
  return response.json();
}

// Error handling
try {
  riskyOperation();
} catch (error) {
  console.error(error);
}

// Nested structures
function outer(a) {
  function inner(b) {
    return a + b;
  }
  return inner;
}

// Complex patterns
class Calculator {
  add(x, y) {
    return x + y;
  }

  subtract(x, y) {
    return x - y;
  }
}

// Array operations
const numbers = [1, 2, 3, 4, 5];
const doubled = numbers.map(x => x * 2);
const filtered = numbers.filter(x => x > 2);

// Callbacks
setTimeout(function() {
  console.log("Delayed");
}, 1000);

// Export patterns
export function publicFunction() {
  return "public";
}

export default Calculator;
