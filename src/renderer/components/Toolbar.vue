<template>
  <div class="toolbar">
    <div class="toolbar-group">
      <button class="tb has-label" @click="$emit('newFile')" title="New (⌘N)">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3.5 1.5h6l3 3v8a1 1 0 0 1-1 1h-8a1 1 0 0 1-1-1v-10a1 1 0 0 1 1-1Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M9.5 1.5v3h3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <span>New</span>
      </button>
      <button class="tb has-label" @click="$emit('openFile')" title="Open (⌘O)">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 12.5V4a1 1 0 0 1 1-1h3.5l1.5 1.5H13a1 1 0 0 1 1 1V7" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><path d="M1.5 12.5l1.5-5h10l1.5 5H1.5Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>
        <span>Open</span>
      </button>
      <button class="tb has-label" @click="$emit('saveFile')" title="Save (⌘S)">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M12.5 14.5h-9a1 1 0 0 1-1-1v-11a1 1 0 0 1 1-1h7l3 3v9a1 1 0 0 1-1 1Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M5.5 14.5v-4h5v4" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M5.5 1.5v3h4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <span>Save</span>
      </button>
    </div>

    <div class="toolbar-sep" aria-hidden="true"></div>

    <div class="toolbar-group">
      <button class="tb has-label" @click="$emit('addTable')" title="Add Table">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="12" height="12" rx="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M2 5.5h12M2 9.5h12M6 5.5v6.5" stroke="currentColor" stroke-width="1.3"/></svg>
        <span>Table</span>
      </button>
      <button class="tb has-label" @click="$emit('addTextBox')" title="Add Text Box">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2" y="3" width="12" height="10" rx="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M5.5 6v4M5.5 6h5M8 6v4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
        <span>Text</span>
      </button>
      <button class="tb has-label" @click="$emit('addChart')" title="Add Chart">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="12" height="12" rx="1.5" stroke="currentColor" stroke-width="1.3"/><rect x="4" y="8" width="2" height="4" rx="0.5" fill="currentColor"/><rect x="7" y="5" width="2" height="7" rx="0.5" fill="currentColor"/><rect x="10" y="6.5" width="2" height="5.5" rx="0.5" fill="currentColor"/></svg>
        <span>Chart</span>
      </button>
    </div>

    <div class="toolbar-sep" aria-hidden="true"></div>

    <div class="toolbar-group">
      <button class="tb has-label" @click="$emit('mergeCells')" title="Merge cells">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2" y="3" width="12" height="10" rx="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M2 8h12" stroke="currentColor" stroke-width="1.3"/><path d="M6 3v5M10 3v5" stroke="currentColor" stroke-width="1.3" stroke-dasharray="1.8 1.2"/></svg>
        <span>Merge</span>
      </button>
      <button class="tb has-label" @click="$emit('unmergeCells')" title="Unmerge cells">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2" y="3" width="12" height="10" rx="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M2 8h12M6 3v10M10 3v10" stroke="currentColor" stroke-width="1.3"/></svg>
        <span>Unmerge</span>
      </button>
    </div>

    <div class="toolbar-sep" aria-hidden="true"></div>

    <!-- Cell type selector -->
    <div class="toolbar-group">
      <div class="type-selector-wrapper" ref="typeSelectorRef">
        <button class="tb has-label type-selector-btn" @click="toggleTypeMenu" :disabled="!hasActiveCell" title="Cell format type">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M3 3h10v2H3V3ZM3 7h6v2H3V7ZM3 11h8v2H3v-2Z" fill="currentColor" opacity="0.5"/>
            <path d="M12 8l2 3h-4l2-3Z" fill="currentColor"/>
          </svg>
          <span>{{ currentTypeLabel }}</span>
          <svg class="chevron" width="8" height="8" viewBox="0 0 8 8"><path d="M2 3l2 2 2-2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>
        </button>
        <div v-if="typeMenuOpen" class="type-dropdown">
          <button
            v-for="opt in typeOptions"
            :key="opt.value"
            class="type-option"
            :class="{ active: opt.value === currentCellType }"
            @click="setType(opt.value)"
          >
            <span class="type-option-badge" :class="'badge-' + opt.value.replace('_', '-')">{{ opt.short }}</span>
            <span class="type-option-label">{{ opt.label }}</span>
          </button>
        </div>
      </div>

      <!-- Decimal places controls -->
      <button class="tb decimal-btn" :disabled="!hasActiveCell || !supportsDecimals" title="Decrease decimal places" @click="changeDecimals(-1)">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <text x="1" y="12" font-size="9" font-weight="600" fill="currentColor">.0</text>
          <path d="M11 5l3 3-3 3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
          <text x="9.5" y="12" font-size="7" font-weight="600" fill="currentColor">0</text>
        </svg>
      </button>
      <button class="tb decimal-btn" :disabled="!hasActiveCell || !supportsDecimals" title="Increase decimal places" @click="changeDecimals(1)">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <text x="1" y="12" font-size="9" font-weight="600" fill="currentColor">.00</text>
          <path d="M14 5l-3 3 3 3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
          <text x="10" y="12" font-size="7" font-weight="600" fill="currentColor">0</text>
        </svg>
      </button>
    </div>

    <div class="toolbar-sep" aria-hidden="true"></div>

    <!-- Cell coloring -->
    <div class="toolbar-group">
      <!-- Text color -->
      <div class="color-btn-wrapper" ref="textColorRef">
        <button class="tb color-btn" :disabled="!hasActiveCell" title="Text color" @click="applyTextColor(lastTextColor)">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M4.5 12L8 3l3.5 9" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M5.75 9h4.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
          </svg>
          <span class="color-indicator" :style="{ backgroundColor: lastTextColor }"></span>
        </button>
        <button class="tb color-chevron" :disabled="!hasActiveCell" @click.stop="toggleColorMenu('text')">
          <svg width="8" height="8" viewBox="0 0 8 8"><path d="M2 3l2 2 2-2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>
        </button>
        <div v-if="colorMenuType === 'text'" class="color-dropdown dropdown-anchor-right" @click.stop>
          <div class="color-dropdown-header">Text Color</div>
          <div class="color-grid">
            <button
              v-for="c in colorPalette"
              :key="c"
              class="color-swatch"
              :class="{ active: c === currentTextColor, 'is-light': isLightColor(c) }"
              :style="{ backgroundColor: c }"
              :title="c"
              @click="applyTextColor(c)"
            ></button>
          </div>
          <button class="color-clear-btn" @click="clearTextColor">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
            <span>No color</span>
          </button>
          <div class="color-custom-row">
            <label class="color-custom-label">Custom:</label>
            <input type="color" class="color-custom-input" :value="lastTextColor" @input="onCustomTextColor($event)" />
          </div>
        </div>
      </div>

      <!-- Fill color -->
      <div class="color-btn-wrapper" ref="fillColorRef">
        <button class="tb color-btn" :disabled="!hasActiveCell" title="Fill color" @click="applyFillColor(lastFillColor)">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <rect x="2.5" y="2.5" width="11" height="11" rx="2" stroke="currentColor" stroke-width="1.3"/>
            <rect x="4" y="4" width="8" height="8" rx="1" :fill="lastFillColor" opacity="0.5"/>
          </svg>
          <span class="color-indicator" :style="{ backgroundColor: lastFillColor }"></span>
        </button>
        <button class="tb color-chevron" :disabled="!hasActiveCell" @click.stop="toggleColorMenu('fill')">
          <svg width="8" height="8" viewBox="0 0 8 8"><path d="M2 3l2 2 2-2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>
        </button>
        <div v-if="colorMenuType === 'fill'" class="color-dropdown dropdown-anchor-right" @click.stop>
          <div class="color-dropdown-header">Fill Color</div>
          <div class="color-grid">
            <button
              v-for="c in colorPalette"
              :key="c"
              class="color-swatch"
              :class="{ active: c === currentFillColor, 'is-light': isLightColor(c) }"
              :style="{ backgroundColor: c }"
              :title="c"
              @click="applyFillColor(c)"
            ></button>
          </div>
          <button class="color-clear-btn" @click="clearFillColor">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
            <span>No fill</span>
          </button>
          <div class="color-custom-row">
            <label class="color-custom-label">Custom:</label>
            <input type="color" class="color-custom-input" :value="lastFillColor" @input="onCustomFillColor($event)" />
          </div>
        </div>
      </div>
    </div>

    <!-- ═══ Formatting controls (shown for active cell OR text box) ═══ -->
    <template v-if="hasActiveCell || hasActiveTextBox">
      <div class="toolbar-sep" aria-hidden="true"></div>

      <!-- Font family picker -->
      <div class="toolbar-group">
        <div class="font-selector-wrapper" ref="fontSelectorRef">
          <button class="tb has-label font-selector-btn" @click="toggleFontMenu" title="Font family">
            <span class="font-selector-label" :style="{ fontFamily: fmtFontFamily !== 'System Default' ? fmtFontFamily : undefined }">{{ fmtFontFamily }}</span>
            <svg class="chevron" width="8" height="8" viewBox="0 0 8 8"><path d="M2 3l2 2 2-2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>
          </button>
          <div v-if="fontMenuOpen" class="font-dropdown">
            <button
              v-for="font in fontOptions"
              :key="font"
              class="font-option"
              :class="{ active: font === fmtFontFamily }"
              :style="{ fontFamily: font !== 'System Default' ? font : undefined }"
              @click="fmtSetFont(font)"
            >{{ font }}</button>
          </div>
        </div>
      </div>

      <!-- Font size (text box only) -->
      <template v-if="hasActiveTextBox">
        <div class="toolbar-sep" aria-hidden="true"></div>
        <div class="toolbar-group">
          <button class="tb" title="Decrease font size" @click="tbDecreaseFontSize">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 7h8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
          </button>
          <span class="tb-font-size">{{ activeTextBoxData?.fontSize ?? 14 }}</span>
          <button class="tb" title="Increase font size" @click="tbIncreaseFontSize">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 3v8M3 7h8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
          </button>
        </div>
      </template>

      <div class="toolbar-sep" aria-hidden="true"></div>
      <div class="toolbar-group">
        <button class="tb" :class="{ 'tb-active': fmtIsBold }" title="Bold" @click="fmtToggleBold">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M4 2.5h4a2.5 2.5 0 0 1 0 5H4V2.5ZM4 7.5h4.5a2.5 2.5 0 0 1 0 5H4V7.5Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>
        </button>
        <button class="tb" :class="{ 'tb-active': fmtIsItalic }" title="Italic" @click="fmtToggleItalic">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M9 2.5H6M8 11.5H5M8 2.5L6 11.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </div>

      <div class="toolbar-sep" aria-hidden="true"></div>

      <!-- Alignment -->
      <div class="toolbar-group">
        <button class="tb" :class="{ 'tb-active': fmtAlign === 'left' }" title="Align Left" @click="fmtSetAlign('left')">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 3h10M2 6h6M2 9h8M2 12h5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
        </button>
        <button class="tb" :class="{ 'tb-active': fmtAlign === 'center' }" title="Align Center" @click="fmtSetAlign('center')">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 3h10M4 6h6M3 9h8M4.5 12h5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
        </button>
        <button class="tb" :class="{ 'tb-active': fmtAlign === 'right' }" title="Align Right" @click="fmtSetAlign('right')">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 3h10M8 6h4M6 9h6M9 12h3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
        </button>
      </div>

      <!-- TextBox-specific: colors & border -->
      <template v-if="hasActiveTextBox">
        <div class="toolbar-sep" aria-hidden="true"></div>

        <!-- TextBox text color -->
        <div class="toolbar-group">
          <div class="color-btn-wrapper" ref="tbTextColorRef">
            <button class="tb color-btn" title="Text color" @click="tbApplyTextColor(tbLastTextColor)">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M4.5 12L8 3l3.5 9" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M5.75 9h4.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
              </svg>
              <span class="color-indicator" :style="{ backgroundColor: tbLastTextColor }"></span>
            </button>
            <button class="tb color-chevron" @click.stop="toggleTbColorMenu('tbText')">
              <svg width="8" height="8" viewBox="0 0 8 8"><path d="M2 3l2 2 2-2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>
            </button>
            <div v-if="tbColorMenuType === 'tbText'" class="color-dropdown dropdown-anchor-right" @click.stop>
              <div class="color-dropdown-header">Text Color</div>
              <div class="color-grid">
                <button v-for="c in colorPalette" :key="c" class="color-swatch"
                  :class="{ active: c === activeTextBoxData?.textColor, 'is-light': isLightColor(c) }"
                  :style="{ backgroundColor: c }" :title="c" @click="tbApplyTextColor(c)"></button>
              </div>
              <button class="color-clear-btn" @click="tbApplyTextColor('')">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
                <span>No color</span>
              </button>
              <div class="color-custom-row">
                <label class="color-custom-label">Custom:</label>
                <input type="color" class="color-custom-input" :value="tbLastTextColor" @input="tbApplyTextColor(($event.target as HTMLInputElement).value)" />
              </div>
            </div>
          </div>

          <!-- TextBox fill color -->
          <div class="color-btn-wrapper" ref="tbFillColorRef">
            <button class="tb color-btn" title="Fill color" @click="tbApplyFillColor(tbLastFillColor)">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <rect x="2.5" y="2.5" width="11" height="11" rx="2" stroke="currentColor" stroke-width="1.3"/>
                <rect x="4" y="4" width="8" height="8" rx="1" :fill="tbLastFillColor" opacity="0.5"/>
              </svg>
              <span class="color-indicator" :style="{ backgroundColor: tbLastFillColor }"></span>
            </button>
            <button class="tb color-chevron" @click.stop="toggleTbColorMenu('tbFill')">
              <svg width="8" height="8" viewBox="0 0 8 8"><path d="M2 3l2 2 2-2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>
            </button>
            <div v-if="tbColorMenuType === 'tbFill'" class="color-dropdown dropdown-anchor-right" @click.stop>
              <div class="color-dropdown-header">Fill Color</div>
              <div class="color-grid">
                <button v-for="c in colorPalette" :key="c" class="color-swatch"
                  :class="{ active: c === activeTextBoxData?.bgColor, 'is-light': isLightColor(c) }"
                  :style="{ backgroundColor: c }" :title="c" @click="tbApplyFillColor(c)"></button>
              </div>
              <button class="color-clear-btn" @click="tbApplyFillColor('')">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
                <span>No fill</span>
              </button>
              <div class="color-custom-row">
                <label class="color-custom-label">Custom:</label>
                <input type="color" class="color-custom-input" :value="tbLastFillColor" @input="tbApplyFillColor(($event.target as HTMLInputElement).value)" />
              </div>
            </div>
          </div>
        </div>

        <div class="toolbar-sep" aria-hidden="true"></div>

        <!-- TextBox border -->
        <div class="toolbar-group">
          <div class="color-btn-wrapper" ref="tbBorderColorRef">
            <button class="tb color-btn" title="Border color" @click="tbApplyBorderColor(tbLastBorderColor)">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <rect x="2.5" y="2.5" width="11" height="11" rx="2" stroke="currentColor" stroke-width="1.3" stroke-dasharray="2.5 1.5"/>
              </svg>
              <span class="color-indicator" :style="{ backgroundColor: tbLastBorderColor }"></span>
            </button>
            <button class="tb color-chevron" @click.stop="toggleTbColorMenu('tbBorder')">
              <svg width="8" height="8" viewBox="0 0 8 8"><path d="M2 3l2 2 2-2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>
            </button>
            <div v-if="tbColorMenuType === 'tbBorder'" class="color-dropdown dropdown-anchor-right" @click.stop>
              <div class="color-dropdown-header">Border</div>
              <div class="color-grid">
                <button v-for="c in colorPalette" :key="c" class="color-swatch"
                  :class="{ active: c === activeTextBoxData?.borderColor, 'is-light': isLightColor(c) }"
                  :style="{ backgroundColor: c }" :title="c" @click="tbApplyBorderColor(c)"></button>
              </div>
              <button class="color-clear-btn" @click="tbApplyBorderColor(''); tbUpdateProp('borderWidth', 0)">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
                <span>No border</span>
              </button>
              <div class="color-custom-row">
                <label class="color-custom-label">Width:</label>
                <select class="tb-border-select" :value="activeTextBoxData?.borderWidth ?? 0" @change="tbUpdateProp('borderWidth', Number(($event.target as HTMLSelectElement).value))">
                  <option value="0">None</option>
                  <option value="1">1px</option>
                  <option value="2">2px</option>
                  <option value="3">3px</option>
                  <option value="4">4px</option>
                </select>
              </div>
              <div class="color-custom-row">
                <label class="color-custom-label">Radius:</label>
                <select class="tb-border-select" :value="activeTextBoxData?.borderRadius ?? 0" @change="tbUpdateProp('borderRadius', Number(($event.target as HTMLSelectElement).value))">
                  <option value="0">0</option>
                  <option value="4">4px</option>
                  <option value="8">8px</option>
                  <option value="12">12px</option>
                  <option value="16">16px</option>
                  <option value="24">24px</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </template>
    </template>

    <div class="toolbar-spacer"></div>

    <div class="toolbar-group">
      <button class="tb theme-toggle" @click="toggleTheme" :title="isDark ? 'Light mode' : 'Dark mode'">
        <!-- Sun icon (shown in dark mode) -->
        <svg v-if="isDark" width="16" height="16" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="3" stroke="currentColor" stroke-width="1.3"/>
          <path d="M8 2v1.5M8 12.5V14M2 8h1.5M12.5 8H14M3.75 3.75l1.06 1.06M11.19 11.19l1.06 1.06M12.25 3.75l-1.06 1.06M4.81 11.19l-1.06 1.06" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
        </svg>
        <!-- Moon icon (shown in light mode) -->
        <svg v-else width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M13.5 9.5a5.5 5.5 0 0 1-7-7 5.5 5.5 0 1 0 7 7Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
        </svg>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, inject } from 'vue'
import { SPREADSHEET_KEY } from '../composables/useSpreadsheet'
import type { CellDataType } from '../engine/cellTypes'
import { getTypeLabel } from '../engine/cellTypes'

defineEmits<{ 
  addTable: []
  addTextBox: []
  addChart: []
  newFile: []
  openFile: []
  saveFile: []
  mergeCells: []
  unmergeCells: []
}>()

const ss = inject(SPREADSHEET_KEY)!

// ── TextBox formatting ──

const hasActiveTextBox = computed(() => !!ss.activeTextBoxId.value)

const activeTextBoxData = computed(() => {
  if (!ss.activeTextBoxId.value) return null
  return ss.findTextBox(ss.activeTextBoxId.value) ?? null
})

const tbTextColorRef = ref<HTMLElement | null>(null)
const tbFillColorRef = ref<HTMLElement | null>(null)
const tbBorderColorRef = ref<HTMLElement | null>(null)
const tbColorMenuType = ref<'tbText' | 'tbFill' | 'tbBorder' | null>(null)
const tbLastTextColor = ref('#000000')
const tbLastFillColor = ref('#FFFFFF')
const tbLastBorderColor = ref('#CCCCCC')

function toggleTbColorMenu(type: 'tbText' | 'tbFill' | 'tbBorder') {
  tbColorMenuType.value = tbColorMenuType.value === type ? null : type
}

function tbUpdateProp(prop: string, value: any) {
  const id = ss.activeTextBoxId.value
  if (!id) return
  ss.updateTextBox(id, { [prop]: value })
}

function tbToggleBold() {
  const current = activeTextBoxData.value?.fontWeight ?? 'normal'
  tbUpdateProp('fontWeight', current === 'bold' ? 'normal' : 'bold')
}

function tbToggleItalic() {
  const current = activeTextBoxData.value?.fontStyle ?? 'normal'
  tbUpdateProp('fontStyle', current === 'italic' ? 'normal' : 'italic')
}

function tbSetAlign(a: 'left' | 'center' | 'right') {
  tbUpdateProp('align', a)
}

function tbIncreaseFontSize() {
  const size = activeTextBoxData.value?.fontSize ?? 14
  tbUpdateProp('fontSize', Math.min(size + 2, 120))
}

function tbDecreaseFontSize() {
  const size = activeTextBoxData.value?.fontSize ?? 14
  tbUpdateProp('fontSize', Math.max(size - 2, 8))
}

function tbApplyTextColor(color: string) {
  tbUpdateProp('textColor', color)
  if (color) tbLastTextColor.value = color
  tbColorMenuType.value = null
}

function tbApplyFillColor(color: string) {
  tbUpdateProp('bgColor', color)
  if (color) tbLastFillColor.value = color
  tbColorMenuType.value = null
}

function tbApplyBorderColor(color: string) {
  tbUpdateProp('borderColor', color)
  if (color) {
    tbLastBorderColor.value = color
    // auto-set borderWidth to 1 if not set
    if (!activeTextBoxData.value?.borderWidth) tbUpdateProp('borderWidth', 1)
  }
  tbColorMenuType.value = null
}

// ── Unified formatting (works for both cells and text boxes) ──

const fmtIsBold = computed(() => {
  if (hasActiveTextBox.value) return activeTextBoxData.value?.fontWeight === 'bold'
  const fmt = ss.getActiveCellFormat()
  return fmt?.bold ?? false
})

const fmtIsItalic = computed(() => {
  if (hasActiveTextBox.value) return activeTextBoxData.value?.fontStyle === 'italic'
  const fmt = ss.getActiveCellFormat()
  return fmt?.italic ?? false
})

const fmtAlign = computed<'left' | 'center' | 'right'>(() => {
  if (hasActiveTextBox.value) return activeTextBoxData.value?.align ?? 'left'
  const fmt = ss.getActiveCellFormat()
  return fmt?.align ?? 'left'
})

function fmtToggleBold() {
  if (hasActiveTextBox.value) {
    tbToggleBold()
  } else if (hasActiveCell.value) {
    const current = ss.getActiveCellFormat()?.bold ?? false
    ss.setSelectionFormat({ bold: !current })
  }
}

function fmtToggleItalic() {
  if (hasActiveTextBox.value) {
    tbToggleItalic()
  } else if (hasActiveCell.value) {
    const current = ss.getActiveCellFormat()?.italic ?? false
    ss.setSelectionFormat({ italic: !current })
  }
}

function fmtSetAlign(a: 'left' | 'center' | 'right') {
  if (hasActiveTextBox.value) {
    tbSetAlign(a)
  } else if (hasActiveCell.value) {
    ss.setSelectionFormat({ align: a })
  }
}

// ── Font family picker ──

const fontSelectorRef = ref<HTMLElement | null>(null)
const fontMenuOpen = ref(false)

const fontOptions = [
  'System Default',
  'Arial',
  'Helvetica Neue',
  'Georgia',
  'Times New Roman',
  'Courier New',
  'Menlo',
  'SF Mono',
  'Verdana',
  'Trebuchet MS',
  'Palatino',
  'Garamond',
  'Futura',
  'Avenir',
  'Gill Sans',
  'Optima',
]

const fmtFontFamily = computed(() => {
  if (hasActiveTextBox.value) return activeTextBoxData.value?.fontFamily ?? 'System Default'
  const fmt = ss.getActiveCellFormat()
  return fmt?.fontFamily ?? 'System Default'
})

function toggleFontMenu() {
  fontMenuOpen.value = !fontMenuOpen.value
}

function fmtSetFont(font: string) {
  if (hasActiveTextBox.value) {
    tbUpdateProp('fontFamily', font)
  } else if (hasActiveCell.value) {
    ss.setSelectionFormat({ fontFamily: font === 'System Default' ? undefined : font })
  }
  fontMenuOpen.value = false
}

// ── Type selector ──

const typeSelectorRef = ref<HTMLElement | null>(null)
const typeMenuOpen = ref(false)

const typeOptions: { value: CellDataType; label: string; short: string }[] = [
  { value: 'text', label: 'Text', short: 'ABC' },
  { value: 'integer', label: 'Integer', short: '123' },
  { value: 'float', label: 'Decimal', short: '1.2' },
  { value: 'percent', label: 'Percent (%)', short: '%' },
  { value: 'currency_usd', label: 'Dollar ($)', short: '$' },
  { value: 'currency_eur', label: 'Euro (€)', short: '€' },
]

const hasActiveCell = computed(() => !!ss.activeCell.value)

const currentCellType = computed<CellDataType>(() => {
  if (!ss.activeCell.value) return 'text'
  return ss.getCellType(ss.activeCell.value.tableId, ss.activeCell.value.col, ss.activeCell.value.row)
})

const supportsDecimals = computed(() => {
  const t = currentCellType.value
  return t === 'float' || t === 'percent' || t === 'currency_eur' || t === 'currency_usd'
})

const currentTypeLabel = computed(() => {
  const opt = typeOptions.find(o => o.value === currentCellType.value)
  return opt ? opt.short : getTypeLabel(currentCellType.value)
})

function changeDecimals(delta: number) {
  if (!ss.activeCell.value) return
  const fmt = ss.getActiveCellFormat()
  const current = fmt?.decimalPlaces ?? 2
  const next = Math.max(0, Math.min(10, current + delta))
  ss.setSelectionFormat({ decimalPlaces: next })
}

function toggleTypeMenu() {
  typeMenuOpen.value = !typeMenuOpen.value
}

function setType(t: CellDataType) {
  if (!ss.activeCell.value) return
  ss.setCellType(ss.activeCell.value.tableId, ss.activeCell.value.col, ss.activeCell.value.row, t)
  typeMenuOpen.value = false
}

function onClickOutside(e: MouseEvent) {
  if (typeMenuOpen.value && typeSelectorRef.value && !typeSelectorRef.value.contains(e.target as Node)) {
    typeMenuOpen.value = false
  }
  if (fontMenuOpen.value && fontSelectorRef.value && !fontSelectorRef.value.contains(e.target as Node)) {
    fontMenuOpen.value = false
  }
  if (colorMenuType.value && textColorRef.value && fillColorRef.value
    && !textColorRef.value.contains(e.target as Node)
    && !fillColorRef.value.contains(e.target as Node)) {
    colorMenuType.value = null
  }
  // Close text box color menus
  if (tbColorMenuType.value
    && (!tbTextColorRef.value || !tbTextColorRef.value.contains(e.target as Node))
    && (!tbFillColorRef.value || !tbFillColorRef.value.contains(e.target as Node))
    && (!tbBorderColorRef.value || !tbBorderColorRef.value.contains(e.target as Node))) {
    tbColorMenuType.value = null
  }
}

// ── Cell coloring ──

const textColorRef = ref<HTMLElement | null>(null)
const fillColorRef = ref<HTMLElement | null>(null)
const colorMenuType = ref<'text' | 'fill' | null>(null)
const lastTextColor = ref('#000000')
const lastFillColor = ref('#FFEB3B')

const colorPalette = [
  '#000000', '#434343', '#666666', '#999999', '#B7B7B7', '#CCCCCC', '#D9D9D9', '#EFEFEF', '#F3F3F3', '#FFFFFF',
  '#980000', '#FF0000', '#FF9900', '#FFFF00', '#00FF00', '#00FFFF', '#4A86E8', '#0000FF', '#9900FF', '#FF00FF',
  '#E6B8AF', '#F4CCCC', '#FCE5CD', '#FFF2CC', '#D9EAD3', '#D0E0E3', '#C9DAF8', '#CFE2F3', '#D9D2E9', '#EAD1DC',
  '#DD7E6B', '#EA9999', '#F9CB9C', '#FFE599', '#B6D7A8', '#A2C4C9', '#A4C2F4', '#9FC5E8', '#B4A7D6', '#D5A6BD',
  '#CC4125', '#E06666', '#F6B26B', '#FFD966', '#93C47D', '#76A5AF', '#6D9EEB', '#6FA8DC', '#8E7CC3', '#C27BA0',
  '#A61C00', '#CC0000', '#E69138', '#F1C232', '#6AA84F', '#45818E', '#3C78D8', '#3D85C6', '#674EA7', '#A64D79',
  '#85200C', '#990000', '#B45F06', '#BF9000', '#38761D', '#134F5C', '#1155CC', '#0B5394', '#351C75', '#741B47',
]

const currentTextColor = computed(() => {
  const fmt = ss.getActiveCellFormat()
  return fmt?.textColor ?? null
})

const currentFillColor = computed(() => {
  const fmt = ss.getActiveCellFormat()
  return fmt?.bgColor ?? null
})

function toggleColorMenu(type: 'text' | 'fill') {
  colorMenuType.value = colorMenuType.value === type ? null : type
}

function applyTextColor(color: string) {
  ss.setSelectionFormat({ textColor: color })
  lastTextColor.value = color
  colorMenuType.value = null
}

function applyFillColor(color: string) {
  ss.setSelectionFormat({ bgColor: color })
  lastFillColor.value = color
  colorMenuType.value = null
}

function clearTextColor() {
  ss.setSelectionFormat({ textColor: undefined })
  colorMenuType.value = null
}

function clearFillColor() {
  ss.setSelectionFormat({ bgColor: undefined })
  colorMenuType.value = null
}

function onCustomTextColor(e: Event) {
  const color = (e.target as HTMLInputElement).value
  applyTextColor(color)
}

function onCustomFillColor(e: Event) {
  const color = (e.target as HTMLInputElement).value
  applyFillColor(color)
}

function isLightColor(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return (r * 299 + g * 587 + b * 114) / 1000 > 200
}

// ── Theme ──

const isDark = ref(false)

onMounted(() => {
  const saved = localStorage.getItem('slate-theme')
  if (saved) {
    isDark.value = saved === 'dark'
  } else {
    isDark.value = window.matchMedia('(prefers-color-scheme: dark)').matches
  }
  applyTheme()
  document.addEventListener('click', onClickOutside)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', onClickOutside)
})

function toggleTheme() {
  isDark.value = !isDark.value
  applyTheme()
  localStorage.setItem('slate-theme', isDark.value ? 'dark' : 'light')
}

function applyTheme() {
  document.documentElement.setAttribute('data-theme', isDark.value ? 'dark' : 'light')
}
</script>

<style scoped lang="scss">
.toolbar {
  display: flex;
  align-items: center;
  height: 40px;
  padding: 0 10px;
  background: var(--bg-primary);
  border-bottom: 1px solid var(--border-color);
  user-select: none;
  flex-shrink: 0;
  gap: 2px;
  overflow: visible;
  position: relative;
  z-index: 50;
}

.toolbar-group {
  display: flex;
  align-items: center;
  gap: 1px;
}

.toolbar-sep {
  width: 1px;
  height: 16px;
  background: var(--border-color);
  margin: 0 6px;
  flex-shrink: 0;
}

.toolbar-spacer {
  flex: 1;
}

/* ── Toolbar button ── */

.tb {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  height: 30px;
  min-width: 30px;
  padding: 0 7px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
  -webkit-app-region: no-drag;

  svg {
    flex-shrink: 0;
  }

  &:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  &:active {
    background: var(--bg-selected);
  }

  &.has-label {
    padding: 0 10px 0 7px;

    span {
      font-size: 12px;
      font-weight: 500;
      letter-spacing: 0.01em;
    }
  }

  &.theme-toggle {
    margin-left: 2px;
  }
}

/* ── Type selector dropdown ── */

.decimal-btn {
  padding: 0 4px !important;
  min-width: 24px;
}

.type-selector-wrapper {
  position: relative;
}

.type-selector-btn {
  gap: 4px !important;

  .chevron {
    opacity: 0.5;
    margin-left: 1px;
  }
}

.type-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 4px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  box-shadow: var(--shadow-lg);
  padding: 4px;
  z-index: 100;
  min-width: 150px;
}

.type-option {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 5px 8px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--text-primary);
  font-size: 12px;
  cursor: pointer;
  transition: background 0.1s;

  &:hover {
    background: var(--bg-hover);
  }

  &.active {
    background: var(--accent-color-alpha, rgba(66, 133, 244, 0.12));
    font-weight: 600;
  }
}

.type-option-badge {
  font-size: 9px;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 3px;
  min-width: 26px;
  text-align: center;
  background: var(--bg-tertiary);
  color: var(--text-muted);

  &.badge-integer {
    background: rgba(59, 130, 246, 0.12);
    color: rgb(59, 130, 246);
  }
  &.badge-float {
    background: rgba(99, 102, 241, 0.12);
    color: rgb(99, 102, 241);
  }
  &.badge-currency-eur {
    background: rgba(16, 185, 129, 0.12);
    color: rgb(16, 185, 129);
  }
  &.badge-currency-usd {
    background: rgba(34, 197, 94, 0.12);
    color: rgb(34, 197, 94);
  }
  &.badge-text {
    background: rgba(245, 158, 11, 0.12);
    color: rgb(245, 158, 11);
  }
}

.type-option-label {
  flex: 1;
  text-align: left;
}

/* ── Color picker buttons ── */

.color-btn-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.color-btn {
  padding-right: 2px !important;
  border-top-right-radius: 0 !important;
  border-bottom-right-radius: 0 !important;
  position: relative;
}

.color-indicator {
  position: absolute;
  bottom: 3px;
  left: 6px;
  right: 6px;
  height: 2.5px;
  border-radius: 1px;
}

.color-chevron {
  padding: 0 3px !important;
  min-width: 14px !important;
  border-top-left-radius: 0 !important;
  border-bottom-left-radius: 0 !important;
}

.color-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 4px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  box-shadow: var(--shadow-lg);
  padding: 10px;
  z-index: 200;
  width: 240px;

  &.dropdown-anchor-right {
    left: auto;
    right: 0;
  }
}

.color-dropdown-header {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  margin-bottom: 8px;
  letter-spacing: 0.02em;
}

.color-grid {
  display: grid;
  grid-template-columns: repeat(10, 1fr);
  gap: 3px;
  margin-bottom: 8px;
}

.color-swatch {
  width: 20px;
  height: 20px;
  border-radius: 4px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  cursor: pointer;
  transition: transform 0.1s, box-shadow 0.1s;
  padding: 0;

  &:hover {
    transform: scale(1.2);
    z-index: 1;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
  }

  &.active {
    outline: 2px solid var(--accent-color);
    outline-offset: 1px;
  }

  &.is-light {
    border-color: rgba(0, 0, 0, 0.15);
  }
}

.color-clear-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 5px 6px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--text-muted);
  font-size: 11px;
  cursor: pointer;
  transition: background 0.1s;

  &:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }
}

.color-custom-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px solid var(--border-color);
}

.color-custom-label {
  font-size: 11px;
  color: var(--text-muted);
  font-weight: 500;
}

.color-custom-input {
  width: 28px;
  height: 22px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 1px;
  cursor: pointer;
  background: transparent;

  &::-webkit-color-swatch-wrapper {
    padding: 1px;
  }
  &::-webkit-color-swatch {
    border: none;
    border-radius: 2px;
  }
}

/* ── TextBox toolbar extras ── */

.tb-active {
  background: var(--accent-color-alpha, rgba(66, 133, 244, 0.12)) !important;
  color: var(--accent-color) !important;
}

/* ── Font selector dropdown ── */

.font-selector-wrapper {
  position: relative;
}

.font-selector-btn {
  gap: 4px !important;
  max-width: 140px;

  .chevron {
    opacity: 0.5;
    margin-left: 1px;
    flex-shrink: 0;
  }
}

.font-selector-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 110px;
}

.font-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 4px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  box-shadow: var(--shadow-lg);
  padding: 4px;
  z-index: 200;
  min-width: 180px;
  max-height: 320px;
  overflow-y: auto;
}

.font-option {
  display: block;
  width: 100%;
  padding: 5px 10px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--text-primary);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  transition: background 0.1s;
  white-space: nowrap;

  &:hover {
    background: var(--bg-hover);
  }

  &.active {
    background: var(--accent-color-alpha, rgba(66, 133, 244, 0.12));
    font-weight: 600;
  }
}

.tb-font-size {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 26px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  background: var(--bg-tertiary);
  border-radius: 4px;
  padding: 0 4px;
  user-select: none;
}

.tb-border-select {
  flex: 1;
  height: 22px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 11px;
  padding: 0 4px;
  cursor: pointer;
  outline: none;

  &:focus {
    border-color: var(--accent-color);
  }
}
</style>
