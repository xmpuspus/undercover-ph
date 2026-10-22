# The pilot must pass access and exposure cases before public navigation

Proposed acceptance cases for the Undercover PH design, 21 October 2026.
These cases define expected behaviour. No product implementation or field pass
is claimed. Use synthetic fixtures for algorithm checks, then repeat relevant
cases on audited pilot routes.

| Case | Input or situation | Expected result | Evidence needed |
| --- | --- | --- | --- |
| Private shortcut | The shortest covered connection has `access=private` and no pedestrian override. The user has no permit. | Public through-routing excludes that connection. | A graph fixture and the source tags. Check the real sign for a pilot example. |
| Pedestrian override | A way has `access=private` and `foot=yes`, with no conflicting condition or barrier. | The access hierarchy permits pedestrians. The filter does not delete it solely because of general access. | A graph fixture that checks the specific override. |
| Mall after closing | A corridor closes at 22:00. The user would reach its entrance at 22:05. | The route uses an open connection or reports no supported route. | A schedule fixture and a dated check of the actual passage hours. |
| Bridge over road | A roofed bridge crosses a road on another level without stairs or a lift at the crossing. | The graph has no transfer at the crossing point. | A graph fixture and a check of the entrances and level connections. |
| Unroofed bridge | The bridge deck has no roof. The ground below the bridge is shaded. | Rain mode does not label the deck sheltered from the shadow below it. | An elevation-aware fixture and field photos of the deck. |
| Stair-free request | The covered route uses stairs. Lift status is unknown. | The app does not label the route stair-free or wheelchair accessible. | A profile fixture and checks of the actual lifts, ramps, widths and entrances. |
| Shady-side change | The opposite sidewalk has more shade, but the next legal crossing is 200 m away. | The route uses that crossing and includes its distance and time. | A two-sided street fixture and a check of the crossing. |
| Reverse direction | Two requests follow the same physical sidewalk in opposite directions at the same instant. | Reversing graph direction preserves that sidewalk's shade and access attributes. | A geometry fixture using left and right tags from the original way direction. |
| More shade, more sun | Route A takes 10 minutes at 50 percent shade. Route B takes 30 minutes at 80 percent shade. | The comparison reports 5 and 6 minutes in sun. A higher shade percentage alone does not make B the balanced recommendation. | Exact arithmetic and the chosen detour policy. |
| Unknown cover | Half a route has no current cover evidence. | The app reports unknown coverage separately and exposes its ranking policy for that uncertainty. | A fixture with missing data and the route card. |
| Distant shadow | A 200 m obstacle outside a 150 m tile margin can cast onto the route at 15 degrees sun elevation. | The shadow computation includes the obstacle or marks the tile unsupported. | A geometry fixture with the calculated 746.410 m shadow envelope. |
| Bucket transition | A route starts before a shadow changes and reaches the affected segment afterwards. | Traversal-time scoring or a stated approximation handles that change within the pilot's accepted error. | Exact-time numerical comparison plus field checks. |
| Stale source | A building or tree changed after the source imagery. | The route shows the source age and follows the correction policy. Missing or stale evidence does not become a current observation. | A dated change record and a route-data version. |
| Historical flood flag | A street has historical flood evidence but no recent street report. | The app shows the historical flag without claiming the street is currently dry, flooded, or safe. | A fixture with distinct timestamps and the route card. |

Keep the test origin and destination coordinates, departure time, route profile,
graph version, shadow-model version and source dates with each result. Record
field failures and unsupported cases. A skipped field case remains untested.
