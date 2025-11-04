// Sample TypeScript file for integration tests

interface User {
  name: string;
  age: number;
}

class UserManager {
  private users: User[] = [];

  addUser(user: User): void {
    this.users.push(user);
  }

  getUsers(): User[] {
    return this.users;
  }
}

class AdminManager extends UserManager {
  role: string = "admin";
}

var userName = "Alice";
var userAge = 30;
const isActive = true;
var userEmail = "alice@example.com";
