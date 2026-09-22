# Contract 06 — Family B Protection

P5.37 ended with Family B production fix enabled by default.

P5.38 must verify current Git truth and protect it.

Expected feature:

```text
enableUnionChimeraPartition
```

Expected semantics:

```text
omitted / true → promoted union-chimera v1
false → exact legacy rollback
```

P5.38 may not:
- change trigger policy;
- change `minBucketPcs`;
- alter candidate scoring;
- alter the default;
- remove rollback;
- reinterpret Family-B target results.

Family A logic should occur downstream wherever possible.
