# Receipt index

Eighteen still-downloadable structured receipt artifacts were preserved as extracted JSON. The latest fully reproduced source SHA among them is `9b0d2f59567a7684b62df932c67b7a96050b605f`.

| Run | Source SHA | Artifact | Archive SHA-256 | Summary |
|---:|---|---:|---|---|
| 31956373310 | `758ad2cda0b0998cf52dd00223dc00969d0803f0` | 9266057793 | `598fc9843d01bc209c94c37b1a0a5347f9dd7fcb20c5fee763be6a85f6803fc6` | `reproduced`, 18 claims |
| 31956375489 | `758ad2cda0b0998cf52dd00223dc00969d0803f0` | 9266058248 | `046fbd4889dd99fefeace276fa86c800a9a9056c9ef950441a80871295d67d08` | `reproduced`, 18 claims |
| 31958300817 | `96d5123f54ef1258a6de6e10d17f2c1dadb2ec14` | 9266561046 | `eaf442b08afdef5f927799fb89154b39a825edb91b1a07db68e942ee61c266cb` | `reproduced`, 18 claims |
| 31958303340 | `96d5123f54ef1258a6de6e10d17f2c1dadb2ec14` | 9266567118 | `2b4f450392e4ab426d5664097666d81b0f7d9e80524d94bdb5ae444145a39ce9` | `reproduced`, 18 claims |
| 31968706959 | `822312b2f0581bec831a957115d21fbdcfb36180` | 9269201472 | `becc7abd07666e80510cb6a954f6a262bbb55da52822f2f2a5a134c9ef11590e` | `reproduced`, 18 claims |
| 31968709863 | `822312b2f0581bec831a957115d21fbdcfb36180` | 9269202137 | `6cec545eb3cf1c31af7f1aeb6fdea21c6d55ba6dc6a826c2d3ce4e425a5f573d` | `reproduced`, 18 claims |
| 31968895455 | `45a9e9185494e9d5944dcb0310c4a9e5caf6657a` | 9269248134 | `de74a65e66a8a02a209b99f66e7e99524f016cba2ed0afff783c8b01e293f3c0` | `reproduced`, 18 claims |
| 31968897548 | `45a9e9185494e9d5944dcb0310c4a9e5caf6657a` | 9269246363 | `f268cff263486098d9858dcfa745f6a4cef6a7dec9fdf4921e6481833ab9f6cc` | `reproduced`, 18 claims |
| 31968935922 | `4f718f37dc1182cd7aee8190ee647fba17dd2da4` | 9269258581 | `6bd5751607f5c102a9acdc1ce6349639e05280c6f0137652765d1a114149c137` | `reproduced`, 18 claims |
| 31968938724 | `4f718f37dc1182cd7aee8190ee647fba17dd2da4` | 9269261852 | `fc6f48e894a5b79dc41059b4889d22f8e60167d5fd3550119082565a2cc0591d` | `reproduced`, 18 claims |
| 31969475877 | `33e377816385f5c97bae79e1cd17d8892d836f52` | 9269389150 | `5b3ad4da985d18b42d8cf02120e54c8caa0967af74e6dff95be558082cec170c` | `reproduced`, 18 claims |
| 31969478689 | `33e377816385f5c97bae79e1cd17d8892d836f52` | 9269389446 | `85ea08ab2d8b485f05c4aeea5bf8bfdbf8e953f2abc88fca8e481e13f4587857` | `reproduced`, 18 claims |
| 31969536444 | `0828f3de9459c87301b0abe58e643c795c86eba4` | 9269410754 | `60c74744c08ad5544f3ec464adc1feb8f52ebd42e83d739847768dd5b5c85136` | `reproduced`, 18 claims |
| 31969538678 | `0828f3de9459c87301b0abe58e643c795c86eba4` | 9269406592 | `e0a0fc179d0fb037bcdc386daf4a8b761e717c36622fe479502b8007057959ff` | `reproduced`, 18 claims |
| 31971737712 | `6b56909018c42f90a67749662013ae0c360fc02f` | 9269982912 | `2c14c07c2f1abbe04ac37096ec5ef68875db2e0e216ea39e55f0c7ebe89cb2af` | `reproduced`, 18 claims |
| 31971740038 | `6b56909018c42f90a67749662013ae0c360fc02f` | 9269985311 | `09d158a8318ff7c065daa611f3371976436dc0adc04d0e5bd0d79a506f4f988b` | `reproduced`, 18 claims |
| 31971764975 | `9b0d2f59567a7684b62df932c67b7a96050b605f` | 9269992639 | `56e1acbdda8be39eb75b12db1be28956c7d22397bc95d491b67257934fca2f51` | `reproduced`, 18 claims |
| 31971767617 | `9b0d2f59567a7684b62df932c67b7a96050b605f` | 9269991589 | `d783cfb14665c891f32e76aca095de08777c5b00e9fb517b26faa38eeb5582d9` | `reproduced`, 18 claims |

## Durable boundary

At `9b0d2f5…`, both the push and pull-request architecture-research runs succeeded and produced receipts whose summaries say `result: reproduced`. Later repository commits add additional research and expected conclusions, but the final substantive head failed TypeScript checking before later certification steps and emitted no receipt artifact.

> **Provenance:** `REMOTE-EXECUTED` · observation · confidence **high** · Actions runs 31971764975 and 31971767617; artifacts 9269992639 and 9269991589


## Core conclusions present in the receipt sets

- Node-main entry behavior is portable across the exercised Bun and Esbuild producers; arbitrary importability is not.
- Bun and Deno standalone executables are not runtime-neutral.
- Broad static-web and generic declaration-output-set profiles were falsified.
- Typed portable command-watch events were falsified.
- Matching-version Node SEA builds ran; a mismatched builder/base combination produced a non-running executable.
- Browser module applications narrowed to module-reachable JS/CSS were established in the exercised fixtures.
- The compatibility evaluator distinguishes tested, policy-supported, override, known-incompatible, missing-capability, and relational failures.

> **Provenance:** `REMOTE-EXECUTED` · observation · confidence **high** · evidence/receipts/run-31971764975/*.json and run-31971767617/*.json

