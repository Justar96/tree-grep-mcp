// TypeScript sample for advanced pattern testing

// Interface definitions
interface User {
  id: number;
  name: string;
  email: string;
}

interface Product {
  id: number;
  title: string;
  price: number;
}

// Type annotations
function greet(name: string): string {
  return `Hello, ${name}`;
}

function calculate(x: number, y: number): number {
  return x + y;
}

// Generic functions
function identity<T>(arg: T): T {
  return arg;
}

function map<T, U>(items: T[], fn: (item: T) => U): U[] {
  return items.map(fn);
}

// Class with decorators (for AST structure testing)
class Component {
  private data: string;

  constructor(data: string) {
    this.data = data;
  }

  public getData(): string {
    return this.data;
  }

  private setData(value: string): void {
    this.data = value;
  }
}

// Type guards
function isUser(obj: any): obj is User {
  return obj && typeof obj.id === 'number' && typeof obj.name === 'string';
}

// Union types
type Status = 'pending' | 'active' | 'completed';

function updateStatus(status: Status): void {
  console.log(`Status: ${status}`);
}

// Async/await with types
async function fetchUser(id: number): Promise<User> {
  const response = await fetch(`/api/users/${id}`);
  return response.json();
}

// Arrow functions with types
const add: (a: number, b: number) => number = (a, b) => a + b;
const multiply = (x: number, y: number): number => x * y;

// Enum
enum Color {
  Red = 'RED',
  Green = 'GREEN',
  Blue = 'BLUE'
}

// Namespace
namespace Utils {
  export function formatDate(date: Date): string {
    return date.toISOString();
  }
}

// Complex nested types
type Nested = {
  outer: {
    inner: {
      value: string;
    };
  };
};

// Export patterns
export { User, Product, greet, calculate };
export default Component;
