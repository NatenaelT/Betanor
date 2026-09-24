# Programmer Guide

The maintained downloadable programmer guide is `docs/PROGRAMMER_GUIDE_DOWNLOAD.md`. The authenticated admin guide page serves it through an authorization-checked route handler; do not copy it into `public/`, because that would make the internal programmer guide anonymously downloadable.

Keep the downloadable guide reconciled with the maintained architecture, database, permissions, routes, workflows, and implementation-plan records in this directory. Mark capabilities as implemented, partial, or planned; never represent the master specification by itself as evidence that a feature is live.
