---
connie-title: Obsidian Media
---
# Obsidian Media

Before the first image.

![[assets/blue.png|160]]

Between images.

![Green rectangle|240x120](../assets/green.svg)

After the images.

1. First list item
   - Nested image
     ![[assets/blue.png|80]]
2. Final list item

![[assets/sample.txt]]

```mermaid
flowchart LR
  Markdown --> Converter --> Confluence
  Obsidian --> Converter
```

```plantuml
@startuml
Alice -> Bob: Release verification
Bob --> Alice: Ready
@enduml
```

![[assets/sequence.puml]]

## Adjacent images regression (#647)

Before adjacent image one.
![[assets/blue.png|80]]
After adjacent image one.

Before adjacent image two.
![Green rectangle](../assets/green.svg)
After adjacent image two.

End of adjacent image regression.
