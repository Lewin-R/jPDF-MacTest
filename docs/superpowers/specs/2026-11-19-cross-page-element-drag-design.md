# Cross-page element drag — design

## Intent
Move inserted elements (images, text boxes, ink, shapes) between pages with one fast, seamless drag of the Select tool.

## Behaviour (decided with the user)
- Vertical moves are no longer clamped to the page; the page's overlay clips the overflow. Horizontal moves stay clamped as today.
- When more than half of the element's height is past the top/bottom edge, it snaps flush to the facing edge of the previous/next page (bottom edge of the previous page, top edge of the next page) and keeps following the pointer from there. Snaps chain across any number of pages within one drag.
- First/last page: no neighbour, so the element can go at most half out.
- Release keeps the element where it is, cut off if it overlaps an edge.
- The move is one undo step; a page change is part of it.
- Auto-scroll while dragging near the top/bottom of the viewer window (speed grows towards the edge). A drag that starts inside an edge band scrolls only once the pointer heads further towards that edge (or leaves the band).
- Highlights do not change pages (they belong to the text under them).

## Approaches
1. **Select tool + page geometry from the viewer (chosen).** Mounted overlays register their viewport and screen rect; the tool maps the pointer to the target page. The drag stays owned by the press page's overlay, which the viewer keeps mounted during the gesture.
2. Re-dispatching the gesture to whichever page overlay is under the pointer — rejected: breaks the one-overlay-owns-the-gesture model and fails when the press page virtualises away.

## Builder calls
- Different page sizes/rotations: the element keeps its on-screen x (stays under the pointer, also between pages centred at different x), clamped onto the new page's width.
- The snapped element's anchor is re-based so it follows the pointer delta from the snap point.
