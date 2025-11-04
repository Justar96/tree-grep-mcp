// Sample JavaScript file for integration tests

function processData(data) {
  console.log("Processing data:", data);
  const result = data.map(x => x * 2);
  console.log("Result:", result);
  return result;
}

function calculateTotal(items) {
  console.log("Calculating total");
  return items.reduce((sum, item) => sum + item, 0);
}

console.log("Starting application");

var oldStyleVar = 1;
var anotherVar = 2;
const modernConst = 3;
