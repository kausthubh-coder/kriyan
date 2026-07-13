const child = Bun.spawn([process.execPath, '--bun', 'next', 'build'], {
  cwd: new URL('..', import.meta.url).pathname,
  env: {
    ...process.env,
    KRIYAN_DESKTOP_BUILD: '1',
    NEXT_PUBLIC_KRIYAN_DESKTOP: '1',
  },
  stdin: 'inherit',
  stdout: 'inherit',
  stderr: 'inherit',
})

process.exit(await child.exited)
