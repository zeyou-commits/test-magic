<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Sur mobile, l’en-tête tient sur une seule ligne avec l’identité compacte, les sélecteurs Départ/Arrivée ouvrent un écran plein écran et le tiroir replié n’affiche que sa synthèse dynamique, afin de préserver une expérience cartographique lisible.
- Keep the desktop collapse control attached to the map panel's right edge and outside its clipped content so it remains reachable when the panel slides offscreen.
- All tracking views use trackingTimes and departureForSignal from the browser-safe tracking module; one provenance-aware source prevents timetable/AIS divergence.
- AIS collection keeps its refresh lease separate from reported_at, rejects out-of-order reports, and stores timestamped observations with service-only writes; port events are first observations tied to one departure, never reconstructed official times.
