---
title: "Object Storage Benchmarking"
description: "Loki and you will really hate slow read ops."
date: "May 19 2025"
---

When shifting from EFK to LokiStack in OpenShift, the architecture takes a fundamental turn as logs are no longer stored using block storage in Elasticsearch, but instead are written to object storage. 

However, not everyone (typically those on premises) have object storage readily available. For those without object storage, the guidance has been to use ODFs MCG (noobaa) with a `pv-pool` backing store. Simply, this is essentially deploying Noobaa backed on existing storage to provide object storage APIs for Loki to consume. But how well does that actually work in practice, especially at scale and when comparing it to other object storage solutions?

Now, it is expected that querying logs will be slower in LokiStack when compared to EFK, this just is the case with the change in architecture as logs might have to be pulled down from the object storage before being read and presented to the user, especially slower when dealing with large amounts of data. Thus, the longer response time of historic and more complex queries has to be accepted to a degree.

## So, why Benchmark?

Instead of relying solely on feel, I wanted to understand how various S3 backends perform when used with LokiStack particularly under read heavy operations to like what log queries essentially are. Quite simply, slow reads can severely impact the user experience when troubleshooting or searching logs which is something you obviously want to avoid.

To find the best option available to me in the environment I was in I decided to benchmark a few setups using [MinIO’s Warp tool](https://github.com/minio/warp). The idea wasn’t to compare vendors per se, but rather to explore the comparative difference between the options I had available and to primarily compare other options to MCG (to where I was seeing slow responsiveness in large clusters).

## Setup & Scenarios

I ran benchmarks against the following scenarios:

- MCG out of the box using a `pv-pool` backing store
- Dell ECS S3
- MCG using the the same Dell ECS S3 as a backing store

The focus of my investigation here was on **read heavy operations** (GET, LIST, STAT) since those are likely to be dominant for Loki in querying logs.

Warp is very easy to use, at its simplist, you can just run something like the following:
```bash
$ ./warp mixed --host=xxxx --access-key=xxxx --secret-key=xxxx --bucket=xxxx --tls
```

> Please note, the below are just example results, as explained later in the article, there are many factors to consider here, so there is no one fit all answer.

## Key Results (Mixed Operation Test)

| Metric                 | MCG (pv-pool)             | MCG (Dell backed)       |  Dell ECS                 |
|------------------------|---------------------------|-------------------------|---------------------------|
| **Total Throughput**   | 121.85 MiB/s, 20.33 obj/s | 50.58 MiB/s, 8.39 obj/s | 127.21 MiB/s, 21.16 obj/s |
| **GET Avg Throughput** | 91.33 MiB/s, 9.13 obj/s   | 37.8 MiB/s, 3.78 obj/s  | 95.71 MiB/s, 9.57 obj/s   |
| **GET Avg Latency**    | 1373.7 ms                 | 3369.2 ms               | 1594.6 ms                 |
| **GET TTFB (Avg)**     | 415 ms                    | 2.69 s                  | 96 ms                     |
| **PUT Avg Throughput** | 30.52 MiB/s, 3.05 obj/s   | 12.79 MiB/s, 1.28 obj/s | 31.50 MiB/s, 3.15 obj/s   |
| **PUT Avg Latency**    | 2126.4 ms                 | 4711.0 ms               | 1415.1 ms                 |
| **DELETE Latency**     | 188.4 ms                  | 477.5 ms                | 54.3 ms                   |
| **STAT Latency**       | 130.2 ms                  | 365.6 ms                | 30.5 ms                   |

Warp is a useful utility and allows multiple benchmarks runs to be merged and comparatively compared. This was a really good feature that allowed us to compare the performance of different storage systems quite quickly and easily.

For example, to specifically compare MCG with a pv backing pool to the Dell ECS array:
```bash
$ warp cmp dell/warp_results_dell_mixed.zst mcg_pvpool_backed/warp_results_mcg_mixed.zst
-------------------
Operation: DELETE
Operations: 628 -> 610
* Average: -2.83% (-0.1) obj/s
* Requests: Avg: +149.1ms (+247%), P50: +103.4ms (+263%), P99: +397.2ms (+184%), Best: +5.3ms (+65%), Worst: +989.2ms (+166%) StdDev: +109.9ms (+209%)
* Fastest: +10.73% (+0.8) obj/s
* 50% Median: -5.50% (-0.1) obj/s
* Slowest: NaN% (0.0) obj/s
-------------------
Operation: GET
Operations: 2877 -> 2742
* Average: -4.67% (-4.5 MiB/s) throughput, -4.67% (-0.4) obj/s
* Requests: Avg: -173.1ms (-14%), P50: -306.5ms (-20%), P99: +1.1293s (+39%), Best: -163.7ms (-43%), Worst: +5.1521s (+137%) StdDev: +259.6ms (+57%)
* TTFB: Avg: +319ms (+331%), P50: +226.372968ms (+284%), P99: +1.320459019s (+377%), Best: -16.350656ms (-40%), Worst: +2.78712417s (+376%) StdDev: +298.862985ms (+532%)
* Fastest: +24.63% (+27.6 MiB/s) throughput, +24.66% (+2.8) obj/s
* 50% Median: -2.85% (-2.8 MiB/s) throughput, -2.79% (-0.3) obj/s
* Slowest: -54.60% (-37.7 MiB/s) throughput, -54.64% (-3.8) obj/s
-------------------
Operation: PUT
Operations: 948 -> 919
Duration: 5m1s -> 5m2s
* Average: -3.35% (-1.1 MiB/s) throughput, -3.35% (-0.1) obj/s
* Requests: Avg: +751.4ms (+50%), P50: +726ms (+53%), P99: +2.256s (+97%), Best: -18.9ms (-3%), Worst: +6.441s (+163%) StdDev: +508.5ms (+146%)
-------------------
Operation: STAT
Operations: 1912 -> 1835
* Average: -3.97% (-0.3) obj/s
* Requests: Avg: +112.9ms (+327%), P50: +74.5ms (+433%), P99: +394.2ms (+207%), Best: +2ms (+31%), Worst: +904.7ms (+183%) StdDev: +88.1ms (+262%)
```

## List Operation Test

| Metric                | MCG (pv-pool)  | MCG (Dell backed) |  Dell ECS    |  
|-----------------------|----------------|-------------------|--------------|
| **Obj/s (Avg)**       | 16,650         | 16,007            | 40,649       | 
| **Req Latency (Avg)** | 628.8ms        | 643.4ms           | 247.4ms      | 
| **Req Latency (P99)** | 1571.0ms       | 1624.9ms          | 422.3ms      | 
| **TTFB (Avg)**        | 125ms          | 130ms             | 49ms         | 
| **TTFB (P99)**        | 469ms          | 676ms             | 143ms        | 
| **Slowest Op**        | 7036.9ms       | 12549.8ms         | 600.6ms      | 
| **Throughput Median** | 17,892 obj/s   | 17,066 obj/s      | 41,594 obj/s | 
| **Throughput Lowest** | 5,645 obj/s    | 6,138 obj/s       | 23,229 obj/s | 

To specifically compare MCG with a pv backing pool to the Dell ECS array:
```bash
$ warp cmp dell/warp_results_dell_list.zst mcg_pvpool_backed/warp_results_mcg_list.zst 
-------------------
Operation: LIST
Operations: 24377 -> 9986
* Average: -59.06% (-23984.4) obj/s
* Requests: Avg: +389.2ms (+154%), P50: +361.6ms (+151%), P99: +1.1487s (+272%), Best: -28.7ms (-24%), Worst: +6.4363s (+1072%) StdDev: +149.9ms (+242%)
* TTFB: Avg: +75.4ms (+153%), P50: +64.288416ms (+161%), P99: +325.356144ms (+227%), Best: -1.404854ms (-9%), Worst: +1.62851957s (+634%) StdDev: +56.835209ms (+204%)
```
## Findings & Observations

In my tests, some elements of the results were fairly comparative, however, for our workload and our use case we know what operation types are important to us. The warp tool can really help here when doing comparative analysis helping you to put together the numbers on paper that you need to make an informed decision. 

### GET Operations
- MCG had **4.67% lower throughput**
- TTFB (Time to First Byte) was **up to 377% worse**
- Latency showed **high variance**, with MCG having better best case but dramatically worse worst case times

### STAT Operations
- MCG was **dramatically slower**, with 327% higher average latency
- P50 and P99 request times were also significantly worse

### LIST Operations
- MCG had **59% fewer objects/second**
- Average latency was **154% higher**, with **TTFB also much slower**

### Summary of results

In my case, MCG consistently underperformed Dell ECS, especially in latency sensitive tasks like GET, STAT, and LIST which are likely critical to Loki’s querying responsiveness. While raw throughput was sometimes comparable, MCG's high and unpredictable latency was the real issue, especially in Time to First Byte (TTFB) and worst case response times.

* **GET**: MCG had better best case throughput but worse worst case latency, with TTFB up to 377% slower.
* **STAT**: Showed the largest latency gap, with MCG 3x slower on average.
* **LIST**: MCG was 59% slower in object throughput.

Even when backed by Dell ECS, MCG introduced overhead that negatively impacted consistency. This suggests that MCG adds variability, even when the raw performance of the backing store is strong. 

I did consider whether NooBaa's compression or deduplication features might be affecting performance, but going under the covers and disabling them didn’t help, in fact I found it made things worse. Unfortunately, [tuning options](https://access.redhat.com/solutions/6719951) appear limited, especially via the CRDs exposed in OpenShift.

The bottom line for me is that MCG in the environment I was in especially with pv-pool backing, introduces unpredictable performance and this is critical for Loki, where fast, consistent reads matter.

## Considerations

### Log size

 Additionally, log size will matter. Out of the box logging in OpenShift tends to produce large log events/entries with lots of metadata that might not be useful in practice. These bulkier logs mean more data must be pulled from object storage during queries potentially amplifying any performance pain.

So it may be worth, asking yourself, do you really need all those fields? Is it worth to investigate having [filters](https://docs.redhat.com/en/documentation/openshift_container_platform/4.16/html/logging/performance-and-reliability-tuning#logging-content-filter-prune-records_logging-content-filtering)? Smaller logs, will naturally have a smaller footprint/size and be quicker to download and thus speed up queries at a certain level, however, depending how logs are indexed, this may not be a definitive statement and would require further investigation.

### This Isn’t a “NooBaa is Bad” Post

**This is not a hit piece** on NooBaa/MCG. This benchmark reflects a point in time test using specific older versions, configurations, and hardware. Performance can and does vary widely depending on:

- Backend disk performance (especially for pv-pool)
- Is the backing pv-pool storageclass doing any replication etc?
- NooBaa deployment and number of volumes 
- Object lifeycle/retention periods
- Your infrastructure!

That said, it seems in full ODF deployments RGW (Rados Gateway) seems much more performant than MCG (Noobaa) when comparing the two, [which appears to make sense](https://learn.redhat.com/t5/Containers-DevOps-OpenShift/ODF-MCG-or-RGW/td-p/22413).

If you're deploying LokiStack and relying on MCG especially in `pv-pool` mode it's worth testing your object storage performance before problems show up in production. While MCG may work fine for small scale setups, larger clusters or longer log retention periods may demand more consistent and lower latency backends. So please, run your own benchmarks to weigh up your options.
