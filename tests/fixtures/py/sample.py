# Sample Python file for integration tests

def greet(name):
    """Greet a person by name"""
    print(f"Hello, {name}")
    return f"Greeting sent to {name}"

def calculate(x, y):
    """Calculate sum of two numbers"""
    result = x + y
    return result

def process_data(data):
    """Process data and return results"""
    return [item * 2 for item in data]

class DataProcessor:
    def __init__(self, name):
        self.name = name
    
    def process(self, data):
        return self.name + str(data)
