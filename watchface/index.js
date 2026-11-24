/**
 * StatusApplication — mostrador estilo console de log do Spring Boot
 * Amazfit T-Rex 3 (480x480, Zepp OS)
 *
 *        ▶ Run: StatusApplication
 *   2026-11-18T                    (a hora é o timestamp do log)
 *   17:59
 *   qua  1094 --- [main]
 *   INFO  steps    : 3432
 *   INFO  heartRate: 64 bpm        (WARN ... null sem medição)
 *   INFO  kcal     : 150
 *   INFO  distance : 2.52 km
 *   INFO  sleep    : 7h32m         (WARN ... null sem registro de sono)
 *   INFO  Started in 0.42s         (Goal reached: N ao bater a meta)
 *        ● BT  ·  :8080  ·  UP     (DOWN sem Bluetooth)
 */
import { createWidget, widget, align, prop, text_style } from '@zos/ui'
import { Time, Step, HeartRate, Calorie, Distance, Sleep } from '@zos/sensor'
import { connectStatus } from '@zos/ble'

// ---------- tema (cores do console do Spring Boot) ----------
const C = {
  info: 0x97c459, // INFO / UP / ▶
  warn: 0xef9f27, // WARN
  error: 0xe24b4a, // DOWN
  logger: 0x5dcaa5, // nomes (steps, kcal...)
  value: 0xd3d1c7, // valores e hora
  dim: 0x5f5e5a, // : --- [main] etc.
  pid: 0xd4537e, // PID
  rule: 0x2c2c2a, // linha divisória
  off: 0x444441 // BT desconectado
}

// ---------- tipografia / grade ----------
const FONT = 'fonts/JetBrainsMono-Subset.ttf'
const ADV = 0.6 // JetBrains Mono: 600/1000 em por caractere

const LOG_X = 83
const LOG_TOP = 196
const LOG_SIZE = 23
const LOG_H = 34

const PID = '1094'
const DAYS = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'] // Time.getDay(): 1 = segunda ... 7 = domingo
const pad = (n) => String(n).padStart(2, '0')
// minutos de sono → "7h32m"; null quando o relógio não registrou sono
const sleepText = (min) => (min > 0 ? `${Math.floor(min / 60)}h${pad(min % 60)}m` : null)
const sleepMinutes = (s) => {
  try {
    return (s.getInfo() || {}).totalTime || 0
  } catch (e) {
    return 0 // sem permissão ou sem dado
  }
}

function text(props) {
  return createWidget(widget.TEXT, {
    font: FONT,
    align_h: align.LEFT,
    align_v: align.CENTER_V,
    text_style: text_style.NONE,
    ...props
  })
}

/**
 * Linha de tokens coloridos {text, color} em colunas monoespaçadas.
 * x = número → alinhada à esquerda nesse x; x = 'center' → centralizada na tela.
 */
class Row {
  constructor(x, y, h, size, tokens) {
    this.x = x
    this.y = y
    this.h = h
    this.size = size
    this.tokens = tokens
    this.widgets = tokens.map((t) => text({ x: 0, y, w: 10, h, text: t.text, color: t.color, text_size: size }))
    this.layout()
  }

  set(i, value, color) {
    const t = this.tokens[i]
    if (t.text === value && (color === undefined || t.color === color)) return
    t.text = value
    if (color !== undefined) t.color = color
    this.layout()
  }

  layout() {
    const cw = this.size * ADV
    const total = this.tokens.reduce((n, t) => n + t.text.length, 0)
    const startX = this.x === 'center' ? 240 - (total * cw) / 2 : this.x
    let col = 0
    this.tokens.forEach((t, i) => {
      this.widgets[i].setProperty(prop.MORE, {
        x: Math.round(startX + col * cw),
        y: this.y,
        w: Math.ceil(t.text.length * cw) + this.size, // folga pra nunca entrar em modo de rolagem
        h: this.h,
        text: t.text,
        color: t.color
      })
      col += t.text.length
    })
  }
}

/** Linha de log: `LEVEL  nome     : valor` */
function logLine(i, name, value) {
  return new Row(LOG_X, LOG_TOP + i * LOG_H, LOG_H, LOG_SIZE, [
    { text: 'INFO', color: C.info },
    { text: '  ', color: C.dim },
    { text: name.padEnd(9, ' '), color: C.logger },
    { text: ': ', color: C.dim },
    { text: value, color: C.value }
  ])
}

WatchFace({
  build() {
    // ---------- sensores ----------
    this.time = new Time()
    this.step = new Step()
    this.hr = new HeartRate()
    this.cal = new Calorie()
    this.dist = new Distance()
    this.sleep = new Sleep()

    // ---------- cabeçalho ----------
    new Row('center', 28, 26, 17, [
      { text: '▶', color: C.info },
      { text: ' Run: ', color: C.dim },
      { text: 'StatusApplication', color: C.value }
    ])
    createWidget(widget.FILL_RECT, { x: 128, y: 62, w: 224, h: 1, color: C.rule })

    // timestamp ISO do log: data pequena em cima, hora grande embaixo, alinhados com o log
    this.tStamp = text({ x: LOG_X, y: 70, w: 200, h: 22, text: '0000-00-00T', color: C.dim, text_size: 17 })
    this.tTime = text({
      x: LOG_X - 4, // compensa o recuo do glifo em 72px pra alinhar visualmente com o log
      y: 88,
      w: 300,
      h: 78,
      text: '00:00',
      color: C.value,
      text_size: 72
    })

    this.lDate = new Row(LOG_X, 166, 24, 17, [
      { text: '---  ', color: C.dim },
      { text: PID, color: C.pid },
      { text: ' --- [main]', color: C.dim }
    ])

    // ---------- log ----------
    this.lSteps = logLine(0, 'steps', '0')
    this.lHr = logLine(1, 'heartRate', 'null')
    this.lKcal = logLine(2, 'kcal', '0')
    this.lDist = logLine(3, 'distance', '0.00 km')
    this.lSleep = logLine(4, 'sleep', 'null')
    this.lLast = new Row(LOG_X, LOG_TOP + 5 * LOG_H, LOG_H, LOG_SIZE, [
      { text: 'INFO', color: C.info },
      { text: '  ', color: C.dim },
      { text: 'Started in 0.42s', color: C.value }
    ])

    // ---------- barra de status ----------
    this.lStatus = new Row('center', 404, 24, 15, [
      { text: '●', color: C.off },
      { text: ' BT  ·  :8080  ·  ', color: C.dim },
      { text: 'DOWN', color: C.error }
    ])

    // ---------- atualização ----------
    this.updateTime = () => {
      const t = this.time
      let year
      try {
        year = t.getFullYear ? t.getFullYear() : new Date().getFullYear()
      } catch (e) {
        year = new Date().getFullYear()
      }
      this.tTime.setProperty(prop.MORE, { text: `${pad(t.getHours())}:${pad(t.getMinutes())}` })
      this.tStamp.setProperty(prop.MORE, { text: `${year}-${pad(t.getMonth())}-${pad(t.getDate())}T` })
      this.lDate.set(0, `${DAYS[t.getDay() - 1] || '---'}  `)

      let bt = false
      try {
        bt = !!connectStatus()
      } catch (e) {}
      this.lStatus.set(0, '●', bt ? C.info : C.off)
      this.lStatus.set(2, bt ? 'UP' : 'DOWN', bt ? C.info : C.error)
    }

    this.updateSteps = () => {
      const steps = this.step.getCurrent()
      const target = this.step.getTarget()
      this.lSteps.set(4, String(steps))
      if (target > 0 && steps >= target) this.lLast.set(2, `Goal reached: ${target}`)
      else this.lLast.set(2, 'Started in 0.42s')
    }

    this.updateHr = () => {
      const v = this.hr.getLast()
      if (v > 0) {
        this.lHr.set(0, 'INFO', C.info)
        this.lHr.set(4, `${v} bpm`)
      } else {
        this.lHr.set(0, 'WARN', C.warn)
        this.lHr.set(4, 'null')
      }
    }

    this.updateKcal = () => this.lKcal.set(4, String(Math.round(this.cal.getCurrent())))

    this.updateDist = () => {
      const meters = this.dist.getCurrent() // em metros
      this.lDist.set(4, `${(meters / 1000).toFixed(2)} km`)
    }

    this.updateSleep = () => {
      const s = sleepText(sleepMinutes(this.sleep))
      this.lSleep.set(0, s ? 'INFO' : 'WARN', s ? C.info : C.warn)
      this.lSleep.set(4, s || 'null')
    }

    this.updateAll = () => {
      this.updateTime()
      this.updateSteps()
      this.updateHr()
      this.updateKcal()
      this.updateDist()
      this.updateSleep()
    }

    // sono não tem evento de mudança (o sistema recalcula a cada ~30 min): lê a cada minuto
    this.time.onPerMinute(() => {
      this.updateTime()
      this.updateSleep()
    })
    this.step.onChange(this.updateSteps)
    this.hr.onLastChange(this.updateHr)
    this.cal.onChange(this.updateKcal)
    this.dist.onChange(this.updateDist)

    // ao acordar a tela, garante tudo atualizado
    createWidget(widget.WIDGET_DELEGATE, { resume_call: this.updateAll })

    this.updateAll()
  },

  onDestroy() {
    this.step && this.step.offChange(this.updateSteps)
    this.hr && this.hr.offLastChange(this.updateHr)
    this.cal && this.cal.offChange(this.updateKcal)
    this.dist && this.dist.offChange(this.updateDist)
  }
})
