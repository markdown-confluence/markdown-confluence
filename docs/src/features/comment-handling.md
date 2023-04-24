# Comment Handling

This plugin attempts to find the original location of a comment and reattach it. If it cannot determine the correct location, it will add a section to the bottom of the page and place the comment there.

# Comment Matching Process

## No matches found
If no matches for the text the comment was attached to are found, the comment is moved to the unmatched comment section.

## Exact Match
The plugin first tries to find an exact match for the comment by comparing the text before and after the comment. If an exact match is found, the comment is attached at that location.

## Distance of whole before and after 
If an exact match is not found, the plugin calculates the "distance" between the text before and after the comment in the original location and each potential new location. This distance is calculated using the Levenshtein distance algorithm, which measures the number of changes (insertions, deletions, or substitutions) required to transform one string into another. If there are more than 40 changes before and after the comment text the node is excluded from being a viable option. The potential matches are sorted based on the calculated distances, and the match with the smallest distance is chosen.

## Distance of 2 words before and after
If there are still multiple matches with similar distances, the plugin narrows down the selection by comparing only the words immediately surrounding the comment. The Levenshtein distance is calculated again, and the best match is chosen based on the smallest distance.

## No ability to match
If no suitable match is found, the function returns undefined.

## Flow chart
```mermaid
flowchart TD
    Start --> DoesCommentTextExist{Does comment text exist on page?}
    DoesCommentTextExist -->|Yes| DoesExactMatchExist{Does exact match before and after comment text?}
    DoesCommentTextExist -->|No| UnmatchedCommentSection[Unmatched Comment Section]
    DoesExactMatchExist -->|Yes| AttachComment[Attach Comment To This ADF Node]
    DoesExactMatchExist -->|No| CalculateLevenshtein

    subgraph WholeBeforeAfter
        CalculateLevenshtein[Calculate Levenshtein Distance Between Before and After text] --> SortByMinimumDistance[Sort by minimum distance]
        SortByMinimumDistance --> IsFirstItemMinimumDistanceUnder40{Is first item minimum distance under 40 changes?}
    end

    IsFirstItemMinimumDistanceUnder40 -->|Yes| AttachComment
    IsFirstItemMinimumDistanceUnder40 -->|No| GetXWordsBeforeAfterComment[Get X Words before and after comment]

    subgraph WordsBeforeAfter
        GetXWordsBeforeAfterComment --> TrimBeforeAndAfterToSameLength
        TrimBeforeAndAfterToSameLength --> CalculateWordsLevenshtein
        CalculateWordsLevenshtein --> IsDistanceLessThan50percentCharacters{IsDistanceLessThan50percentCharacters}
        IsDistanceLessThan50percentCharacters -->|Yes| AddToChecks
        IsDistanceLessThan50percentCharacters -->|Yes| CalculateWordsLevenshtein
        IsDistanceLessThan50percentCharacters -->|No| CalculateWordsLevenshtein
        AddToChecks --> SortByWordsMinimumDistance
        SortByWordsMinimumDistance --> IsThereAnyItems{IsThereAnyItems}
    end

    IsThereAnyItems -->|Yes| AttachComment
    IsThereAnyItems -->|No| UnmatchedCommentSection
