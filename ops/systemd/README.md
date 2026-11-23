# NYX worker service

This unit is a deployment artifact only. It is not installed or started from
the repository workspace.

Before installation, create `/etc/nyx/worker.env` as `root:nyx` with mode
`0640`. It must contain only the worker variables documented in
`worker/README.md`; keep the Evolution API key and Supabase service-role key
outside Git and outside the web runtime.

The service is intentionally stopped until the campaign-controls migration is
applied and verified. Install and enable it only on the actual worker host:

```sh
install -o root -g nyx -m 0640 /secure/path/nyx-worker.env /etc/nyx/worker.env
install -o root -g root -m 0644 ops/systemd/nyx-worker.service /etc/systemd/system/nyx-worker.service
systemctl daemon-reload
systemctl enable nyx-worker.service
systemctl is-enabled nyx-worker.service
systemctl is-active nyx-worker.service  # expected: inactive before cutover
```

For a safe stop during a cutover:

```sh
systemctl stop nyx-worker.service
systemctl is-active nyx-worker.service  # expected: inactive
```

Do not run two worker instances against the same outbox.
