/// Singly linked list implementation with push, pop, and reverse operations.
///
/// Uses Box<Node<T>> for heap-allocated nodes. The list owns all its elements
/// and drops them when it goes out of scope.

struct Node<T> {
    value: T,
    next: Option<Box<Node<T>>>,
}

pub struct LinkedList<T> {
    head: Option<Box<Node<T>>>,
    length: usize,
}

impl<T> LinkedList<T> {
    /// Create an empty linked list.
    pub fn new() -> Self {
        LinkedList { head: None, length: 0 }
    }

    /// Push a value onto the front of the list.
    pub fn push(&mut self, value: T) {
        let new_node = Box::new(Node {
            value,
            next: self.head.take(),
        });
        self.head = Some(new_node);
        self.length += 1;
    }

    /// Pop a value from the front of the list. Returns None if empty.
    pub fn pop(&mut self) -> Option<T> {
        self.head.take().map(|node| {
            self.head = node.next;
            self.length -= 1;
            node.value
        })
    }

    /// Reverse the linked list in place.
    pub fn reverse(&mut self) {
        let mut prev = None;
        let mut current = self.head.take();
        while let Some(mut node) = current {
            let next = node.next.take();
            node.next = prev;
            prev = Some(node);
            current = next;
        }
        self.head = prev;
    }

    /// Return the number of elements in the list.
    pub fn len(&self) -> usize {
        self.length
    }

    /// Check if the list is empty.
    pub fn is_empty(&self) -> bool {
        self.length == 0
    }
}
