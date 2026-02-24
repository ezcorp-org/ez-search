"""
Sorting algorithms — implementations of quicksort and mergesort.

Both algorithms use the divide-and-conquer strategy.
Quicksort partitions around a pivot; mergesort splits and merges halves.
"""

from typing import List


def quicksort(arr: List[int]) -> List[int]:
    """Sort a list using the quicksort algorithm."""
    if len(arr) <= 1:
        return arr
    pivot = arr[len(arr) // 2]
    left = [x for x in arr if x < pivot]
    middle = [x for x in arr if x == pivot]
    right = [x for x in arr if x > pivot]
    return quicksort(left) + middle + quicksort(right)


def mergesort(arr: List[int]) -> List[int]:
    """Sort a list using the mergesort algorithm."""
    if len(arr) <= 1:
        return arr
    mid = len(arr) // 2
    left = mergesort(arr[:mid])
    right = mergesort(arr[mid:])
    return merge(left, right)


def merge(left: List[int], right: List[int]) -> List[int]:
    """Merge two sorted lists into a single sorted list."""
    result = []
    i = j = 0
    while i < len(left) and j < len(right):
        if left[i] <= right[j]:
            result.append(left[i])
            i += 1
        else:
            result.append(right[j])
            j += 1
    result.extend(left[i:])
    result.extend(right[j:])
    return result
