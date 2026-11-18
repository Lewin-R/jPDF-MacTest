export interface CommandDef {
  id: string
  title: string
  run(): void | Promise<void>
  enabled?(): boolean
}

export class CommandRegistry {
  private defs = new Map<string, CommandDef>()

  register(def: CommandDef): () => void {
    this.defs.set(def.id, def)
    return () => {
      // Only remove if this registration is still the active one.
      if (this.defs.get(def.id) === def) this.defs.delete(def.id)
    }
  }

  async execute(id: string): Promise<boolean> {
    const def = this.defs.get(id)
    if (!def) return false
    if (def.enabled && !def.enabled()) return false
    await def.run()
    return true
  }

  /** True if the command exists and is currently enabled. */
  canExecute(id: string): boolean {
    const def = this.defs.get(id)
    return !!def && (!def.enabled || def.enabled())
  }

  has(id: string): boolean {
    return this.defs.has(id)
  }
}

export const commands = new CommandRegistry()
