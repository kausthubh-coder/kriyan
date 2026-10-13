# kriyan

Plan your days with [Kriyan](https://kriyan.app) from a terminal, and let your agents do the same.

```sh
npm install -g https://github.com/kausthubh-coder/kriyan/releases/latest/download/kriyan-cli.tgz
kriyan login          # paste a personal access token from Settings
kriyan today
kriyan add "essay fri 5pm #school every week remind 1h before"
kriyan done 2
```

Needs Node 20 or later.

## Commands

| Command                                          | What it does                                                                                |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| `kriyan today [date]`                            | Now and next, the schedule, anytime tasks, tasks from earlier, habits and free time left    |
| `kriyan week [start]`                            | Seven days with planned time against your capacity, deadlines, inbox and tasks with no date |
| `kriyan inbox`                                   | Tasks without a date or a space                                                             |
| `kriyan spaces`                                  | Your spaces as a tree                                                                       |
| `kriyan progress`                                | Time done, goals and habits                                                                 |
| `kriyan add <sentence>`                          | Add a task the way you'd say it, and see what was understood                                |
| `kriyan done <task>`                             | Tick a task off                                                                             |
| `kriyan move <task...> <when>`                   | Move tasks, like `kriyan move 1 4 fri 9am`                                                  |
| `kriyan rm <task>`                               | Delete a task (restore it from the app)                                                     |
| `kriyan habit <name> [--undo]`                   | Check a habit for today                                                                     |
| `kriyan propose --agent <name> --file plan.json` | Propose time blocks for you to accept in the app                                            |
| `kriyan call <op> [json]`                        | Run any operation of the agent API                                                          |
| `kriyan ops`                                     | List the operations                                                                         |
| `kriyan login`, `kriyan logout`                  | Save or remove your token                                                                   |

A task is the number shown next to it in your last listing, part of its title, or its id.
Every read takes `--json`. Run `kriyan <command> --help` for examples.

## For agents

`--json` prints the API's own result. Exit codes: 0 done, 1 Kriyan said no (the message is printed as is), 2 a usage or network problem.

## Settings

- The token is saved in `%APPDATA%\kriyan\config.json` on Windows and `~/.config/kriyan/config.json` elsewhere, readable only by you.
- `KRIYAN_TOKEN` uses a token without saving it.
- `KRIYAN_API_URL` points at another Kriyan server.
- `NO_COLOR` leaves out the coloured space dots.

MIT licence.
