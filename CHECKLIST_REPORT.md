# Picture checklist report

Questions 3 and 4 in all ten practice tests now use the owner-approved colour photographs. Each `key_elements` list is a weighted checklist of what that photograph shows. Model answers were rewritten only where they claimed something the picture does not show.

The app name is still SpeakPass AI. The ETS notice and the 15-language interface are unchanged. No AI provider is named in the app.

## Pictures

Twenty colour JPEGs were added under `images/`. Each file is a progressive RGB JPEG, 1024×768, saved at quality 80. Paths were already set on each question (`images/testNN_q3.jpg` and `images/testNN_q4.jpg`) and match these filenames.

| File | Bytes |
| --- | ---: |
| test01_q3.jpg | 111139 |
| test01_q4.jpg | 80857 |
| test02_q3.jpg | 130001 |
| test02_q4.jpg | 129535 |
| test03_q3.jpg | 145381 |
| test03_q4.jpg | 120527 |
| test04_q3.jpg | 107843 |
| test04_q4.jpg | 111809 |
| test05_q3.jpg | 153684 |
| test05_q4.jpg | 96359 |
| test06_q3.jpg | 186478 |
| test06_q4.jpg | 99332 |
| test07_q3.jpg | 92211 |
| test07_q4.jpg | 117711 |
| test08_q3.jpg | 97293 |
| test08_q4.jpg | 124744 |
| test09_q3.jpg | 94810 |
| test09_q4.jpg | 103092 |
| test10_q3.jpg | 87409 |
| test10_q4.jpg | 88135 |

The service worker precache includes these files, and its cache name is `app-shell-v5`.

On screen, the frame is 4:3, the same shape as the photographs, with `object-fit: contain`, so the whole picture stays visible on a phone and on a desktop. For picture questions the photo sits above a compact timer, so it remains on screen while the candidate is speaking.

## How a checklist is scored

`key_elements` is an array of objects:

| Field | Meaning |
| --- | --- |
| `id` | Stable name for the item |
| `role` | `main` or `detail` |
| `weight` | `main` is 2 or 3. `detail` is 1 |
| `category` | `place`, `people`, `clothing`, `action`, `object`, or `position` |
| `text` | The fact, in plain English |
| `accept` | Synonyms and other phrasings that count as the same fact |
| `contradict` | Optional wrong claims. Each has `text` and `cap` |

The score is on a 0–5 scale.

1. Add the weight of every item whose `accept` list (or a clear equivalent) appears in the answer.
2. Divide by the total of all positive weights and multiply by 5.
3. If the answer matches a contradiction, the score cannot rise above that item's `cap`. The lowest matching cap wins.

Leaving a detail out is not a contradiction. A contradiction is a claim that fights the picture, such as the wrong number of people, the wrong colour, or the wrong place.

## What changed in each answer

Counts below are checklist items after the replacement. Every previous `key_elements` value was a short list of four strings.

### Test 1 Question 3 — flower shop

`images/test01_q3.jpg`. Four people: a teenager in a yellow hoodie browsing buckets, a clerk in a green apron wrapping a pink-and-white bouquet, an older customer in a navy coat holding a wallet, and a second worker in a green apron carrying greenery toward the open door.

Checklist: 14 items (8 main, 6 detail), 36 contradiction caps. Model answer already matched the photograph and was kept.

### Test 1 Question 4 — airport check-in

`images/test01_q4.jpg`. Five adults: an agent in a light blue uniform, a traveler in a red jacket with a black backpack handing over a passport, a black rolling suitcase beside him, two people on a bench (phone and paper cup), and a traveler in a gray jacket pulling another suitcase toward the windows. An airplane tail is outside.

Checklist: 13 items (7 main, 6 detail), 29 contradiction caps. Model answer kept.

### Test 2 Question 3 — hardware aisle

`images/test02_q3.jpg`. Three adults. An employee in a gray vest points at hanging tools. A customer in a brown jacket holds a metal bracket. A shopper in a green sweater reaches for a box. Shelves hold orange and blue bins.

Checklist: 12 items (7 main, 5 detail), 26 contradiction caps.

Model answer changed. The tools hang on a rack, the background shopper's sweater is green, and the bins are orange and blue. The old answer called the tool display a shelf and did not mention those colours.

### Test 2 Question 4 — outdoor cafe

`images/test02_q4.jpg`. Three adults at a sunny sidewalk cafe. A guest in a white shirt writes in an open notebook. A guest in a green sweater sits across the table with a hand near their chin. Two coffee cups are on the round table. A server in a black apron carries a tray of pastries. Empty tables and a potted plant are behind them.

Checklist: 13 items (6 main, 7 detail), 31 contradiction caps.

Model answer changed. The two guests are not clearly talking. The new answer says the person in green watches with a hand near their chin.

### Test 3 Question 3 — downtown crosswalk

`images/test03_q3.jpg`. A woman in a beige coat pushes a gray stroller. A man in a blue shirt walks beside her. A worker in an orange vest waits by an empty hand truck. Cars are stopped at a red light, and a driver is just visible in the silver car. Brick shopfronts line the street.

Checklist: 12 items (7 main, 5 detail), 29 contradiction caps. Saying "three people" is accepted, because the driver is easy to miss. "Only one person", "only two people", and "nobody is crossing" are capped. Model answer kept.

### Test 3 Question 4 — pottery studio

`images/test03_q4.jpg`. Three adults. A woman in a clay-stained apron shapes a bowl on a wheel. A man in a gray t-shirt paints a striped cup. A person in a dark sweater washes up at the sink. Shelves of unfinished pots fill the back wall.

Checklist: 11 items (6 main, 5 detail), 25 contradiction caps. Model answer kept. Rolled sleeves are not required, because the dark sweater's sleeves are not clearly rolled.

### Test 4 Question 3 — supermarket checkout

`images/test04_q3.jpg`. Three adults. A cashier in a red vest holds a scanner. A customer in a red, white, and blue striped shirt packs a beige cloth bag. Bread, a white milk carton, and leafy greens are on the belt. A shopper in a denim jacket waits behind her with a black basket.

Checklist: 13 items (8 main, 5 detail), 28 contradiction caps.

Model answer changed. The time of day is not visible, so "in the afternoon" was removed. The waiting shopper is behind this customer, not described as standing in the next lane.

### Test 4 Question 4 — furniture showroom

`images/test04_q4.jpg`. Three adults beside a green sofa. A salesperson in a navy blazer holds up a green fabric sample. A customer in a yellow dress rests a hand on the sofa. A customer in a gray sweater looks down at it. Floor lamps and a row of pale chairs are in the bright background.

Checklist: 12 items (7 main, 5 detail), 24 contradiction caps. Model answer kept.

### Test 5 Question 3 — farmers market

`images/test05_q3.jpg`. Four adults under white tents. A vendor in a red plaid shirt hands a brown paper bag to a shopper in a denim jacket. Crates of tomatoes and greens cover the table. A shopper in a beige coat walks away with a white cloth bag. Another person looks at loaves at a bread stall.

Checklist: 12 items (7 main, 5 detail), 26 contradiction caps.

Model answer changed. The bag is opaque, so it is no longer called a bag of vegetables. "Weekend" is not visible. The walking shopper's beige coat is named.

### Test 5 Question 4 — open office

`images/test05_q4.jpg`. Four adults. A woman in a gray blouse and a headset points at a monitor. A man in a blue shirt writes in a notebook. Two people in dark sweaters type at computers farther back. Papers, a water bottle, and notebooks are on the desk, with a tall plant by the window.

Checklist: 11 items (6 main, 5 detail), 24 contradiction caps. Model answer kept.

### Test 6 Question 3 — playground

`images/test06_q3.jpg`. Six people: two children and four adults. A child in a red jacket climbs a wooden frame while an adult in a gray coat watches. A child in a green jacket sits on a swing while an adult in a blue jacket stands beside it holding the chains. On the bench, one person wears a cream sweater and the other a green sweater. Bare trees, a fence, and wood chips are behind them.

Checklist: 13 items (6 main, 7 detail), 28 contradiction caps. "Pushing the swing" is accepted as an alternative phrasing, along with "holding the swing chains".

Model answer changed. It no longer says the scene is a cool afternoon, and it describes the visible pose at the swing: an adult in a blue jacket beside a child in a green jacket. The bench pair still count as talking, because they face each other.

### Test 6 Question 4 — laundromat

`images/test06_q4.jpg`. Three adults. A man in a black sweater folds white towels. A woman in a pink cardigan loads light clothes into an open washer. A woman in a brown coat reads on a bench. A laundry basket and a white detergent bottle sit on the table. Gray front-loading machines line the wall.

Checklist: 11 items (5 main, 6 detail), 24 contradiction caps. Model answer kept.

### Test 7 Question 3 — post office

`images/test07_q3.jpg`. Three adults. A clerk in a blue uniform weighs a brown-paper parcel on a platform scale. A customer in a green coat holds a smaller box and a pen. A man in a white shirt writes on a form at a side table. Mail bins cover the back wall.

Checklist: 10 items (5 main, 5 detail), 23 contradiction caps. Model answer kept.

### Test 7 Question 4 — indoor pool

`images/test07_q4.jpg`. Four people. Two adults swim laps, one in a blue cap and one in a red cap, both in goggles. A teenager in a dark swim shirt stands barefoot on the deck holding a blue kickboard. A lifeguard in a yellow shirt sits on a tall white chair. Lane ropes are blue-white and red-white.

Checklist: 11 items (6 main, 5 detail), 26 contradiction caps.

Model answer changed. "Community center" is not written anywhere in the picture, so the answer now says an indoor swimming pool.

### Test 8 Question 3 — pharmacy

`images/test08_q3.jpg`. Three adults at a white counter. A pharmacist in a white coat hands a small brown paper bag to a customer in a black jacket. A customer in a tan sweater stands beside them and waits. Shelves hold plain brown and white bottles, and a low display of soap sits behind the counter.

Checklist: 11 items (6 main, 5 detail), 24 contradiction caps.

Model answer changed. The second customer is beside the first, wearing a tan sweater, not waiting farther back in a separate line.

### Test 8 Question 4 — shoe repair

`images/test08_q4.jpg`. Two adults. A cobbler in a brown apron stitches a brown leather shoe. A customer in a gray coat holds up a pair of black boots. Spools of thread sit on the bench. Shelves of shoes and a window fill the background.

Checklist: 11 items (5 main, 6 detail), 22 contradiction caps.

Model answer changed. The customer is holding the boots up. The old answer said he stood at the counter with them.

### Test 9 Question 3 — phone repair

`images/test09_q3.jpg`. Three adults. A technician in a purple shirt uses a small screwdriver on a dark phone. A customer in a white blouse watches. A worker in a gray polo sorts white chargers in a cardboard box. A compartment tray of tiny parts is on the counter, and plain dark phones line the shelves.

Checklist: 11 items (6 main, 5 detail), 25 contradiction caps. Model answer kept.

### Test 9 Question 4 — print shop

`images/test09_q4.jpg`. Three adults. A clerk in a teal apron hands a thick stack of white paper to a customer in a brown sweater. A large gray printer sits behind the wooden counter. An employee in a black t-shirt loads paper into a second printer. Sample sheets on the wall are coloured geometric blocks, not words.

Checklist: 11 items (6 main, 5 detail), 24 contradiction caps.

Model answer changed. The nearer printer is present, but it is not visibly running.

### Test 10 Question 3 — hair salon

`images/test10_q3.jpg`. Three people. A stylist in a black shirt cuts a client's curly hair with scissors and a comb. The client wears a gray cape. A waiting client in a cream sweater reads a magazine. A large mirror reflects the stylist and the seated client. Those reflections are not extra people. White pump bottles sit on a shelf.

Checklist: 11 items (6 main, 5 detail), 23 contradiction caps. Counting the reflection as more people is capped. Model answer kept.

### Test 10 Question 4 — meeting

`images/test10_q4.jpg`. Four adults. Three listeners sit closer to the camera and write in notebooks: a red blouse, a blue shirt, and a cream sweater. A speaker in a dark jacket stands farther right and points at a bar chart. The bars are blue, purple, red, yellow, and green, with no readable words. Water glasses, pens, and a closed laptop are on the table. A window and a curtain are on the left.

Checklist: 13 items (8 main, 5 detail), 30 contradiction caps.

Model answer changed. The chart is a clear bar chart, not a blurred chart. The three listeners are closer to the camera than the speaker.
