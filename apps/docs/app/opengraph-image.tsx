import { ImageResponse } from 'next/og'
import type { JSX } from 'react'

export const alt = 'Kriyan — your work, your second brain, your infrastructure'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OpenGraphImage(): ImageResponse {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: 'stretch',
          background: '#1b1815',
          color: '#f6f0e6',
          display: 'flex',
          height: '100%',
          padding: '76px 84px',
          position: 'relative',
          width: '100%',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', width: '720px' }}>
          <div
            style={{
              alignItems: 'center',
              color: '#e3ad44',
              display: 'flex',
              fontSize: 30,
              letterSpacing: '-0.02em',
            }}
          >
            <span
              style={{
                background: '#d25d42',
                borderRadius: 999,
                display: 'flex',
                height: 16,
                marginRight: 14,
                width: 16,
              }}
            />
            kriyan
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 70,
              fontWeight: 650,
              letterSpacing: '-0.035em',
              lineHeight: 1.03,
              marginTop: 80,
            }}
          >
            Your work. Your second brain. Your infrastructure.
          </div>
          <div
            style={{
              color: '#bcb2a5',
              display: 'flex',
              fontSize: 26,
              marginTop: 34,
            }}
          >
            Open-source release planned · license published first
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            height: '470px',
            marginLeft: 'auto',
            position: 'relative',
            width: '300px',
          }}
        >
          {[
            [40, 82, 10, '#e3ad44'],
            [190, 38, 7, '#e3ad44'],
            [136, 188, 14, '#d25d42'],
            [258, 235, 8, '#e3ad44'],
            [55, 325, 8, '#e3ad44'],
            [190, 406, 11, '#d25d42'],
          ].map(([left, top, radius, color], index) => (
            <div
              key={index}
              style={{
                background: color,
                borderRadius: 999,
                display: 'flex',
                height: Number(radius) * 2,
                left,
                position: 'absolute',
                top,
                width: Number(radius) * 2,
              }}
            />
          ))}
          <div style={{ background: '#6d5b3b', display: 'flex', height: 2, left: 48, position: 'absolute', top: 102, transform: 'rotate(-15deg)', width: 148 }} />
          <div style={{ background: '#6d5b3b', display: 'flex', height: 2, left: 101, position: 'absolute', top: 153, transform: 'rotate(55deg)', width: 100 }} />
          <div style={{ background: '#6d5b3b', display: 'flex', height: 2, left: 141, position: 'absolute', top: 222, transform: 'rotate(16deg)', width: 124 }} />
          <div style={{ background: '#6d5b3b', display: 'flex', height: 2, left: 62, position: 'absolute', top: 332, transform: 'rotate(-58deg)', width: 160 }} />
          <div style={{ background: '#6d5b3b', display: 'flex', height: 2, left: 68, position: 'absolute', top: 365, transform: 'rotate(22deg)', width: 142 }} />
        </div>
      </div>
    ) as JSX.Element,
    size,
  )
}
