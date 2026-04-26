use proxies.

- make proxy instantiation lazy? 1 path = 1 proxy.
- enforce stricter typing
- introduce delete: will write zeroes into a field
  - delete on a vector element will shift items down and decrease its length

could potentially allow dynamic memory

add a deproxy/snapshot function.

add a deepEquals function. compares byte for byte.

add a inspect function that shows sizes, offsets and alignments of the data structure

add signals implementation?????
