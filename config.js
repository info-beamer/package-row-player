'use strict';
(async () => {

// For some reason sortable.js doesn't properly
// work in chrome 62 without using the forceFallback
// option :-\
const isChrome = !!window.chrome

const store = new Vuex.Store({
  strict: true,
  state: {
    assets: {},
    devices: [],
    config: {
      assignments: [],
      playlist: []
    },
  },
  getters: {
    size(state, getters) {
      if (!getters.has_assignments)
        return 0
      const assignments = state.config.assignments
      let size = 0
      for (const device of assignments[0].devices) {
        size += device.layout == "single" ? 1 : 2
      }
      return size
    },
    has_assignments(state) {
      return state.config.assignments.length > 0
    },
    screen_ratio(state) {
      let ratio = 16 / 9 // XXX: make configurable?
      let rotation = state.config.rotation
      if (rotation == 90 || rotation == 270) {
        ratio = 1.0 / ratio
      }
      console.log(ratio)
      return ratio
    },
    layouts(state, getters) {
      return [
        [],
        [[1]],
        [[1,1], [2]],
        [[1,1,1], [2,1], [1,2], [3]],
        [[1,1,1,1], [1,2,1], [2,1,1], [1,1,2], [2,2], [4]],
      ][getters.size]
    },
    possible_assignments(state, getters) {
      if (getters.has_assignments) {
        return [{
          screens: getters.size,
          text: "Add new screen group"
        }]
      }
      return [
        {screens: 2, text: "Create two screens group"},
        {screens: 3, text: "Create three screens group"},
        {screens: 4, text: "Create four screens group"},
      ]
    }
  },
  mutations: {
    init(state, {assets, config, devices}) {
      state.assets = assets
      state.config = config
      state.devices = devices
    },
    assets_update(state, assets) {
      state.assets = assets
    },
    add_item(state, layout) {
      let content = []
      for (let spread of layout) {
        content.push({
          spread, 
          file: 'empty.png',
        })
      }
      state.config.playlist.push({
        content,
        duration: 10,
      })
    },
    delete_item(state, {item_idx}) {
      state.config.playlist.splice(item_idx, 1)
    },
    assign_asset(state, {item_idx, slot_idx, asset_id}) {
      state.config.playlist[item_idx].content[slot_idx].file = asset_id
    },
    update_duration(state, {item_idx, duration}) {
      state.config.playlist[item_idx].duration = duration
    },
    update_playlist(state, playlist) {
      state.config.playlist = playlist
    },
    add_assignment(state, screens) {
      let devices = []
      for (let i = 0; i < screens; i++) {
        devices.push({
          serial: "",
          layout: "single",
        })
      }
      state.config.assignments.push({
        devices: devices,
      })
    },
    delete_assignment(state, {assignment_idx}) {
      state.config.assignments.splice(assignment_idx, 1)
      if (state.config.assignments.length == 0) {
        // wipe playlist
        state.config.playlist = []
      }
    },
    update_serial(state, {assignment_idx, device_idx, serial}) {
      state.config.assignments[assignment_idx].devices[device_idx].serial = serial
    },
    set_config(state, {key, value}) {
      state.config[key] = value
    },
  },
})

Vue.component('content-slot', {
  template: `
    <div class='slot'>
      <div class='inner' :style='style' @click='edit'>
        <div class='info'>
          {{info}}
        </div>
      </div>
    </div>
  `,
  props: ['slot_idx', 'item_idx', 'file', 'height'],
  computed: { 
    style() {
      return {
        backgroundImage: (
          this.asset
          ? `url(${this.asset.thumb}?crop=none&size=300)`
          : "url(empty.png)"
        ),
        backgroundSize: "100% 100%",
        height: `${this.height}px`,
      }
    },
    asset() {
      const assets = this.$store.state.assets
      return assets[this.file]
    },
    info() {
      let info = []
      if (this.asset) {
        if (this.asset.filetype == 'video') {
          info.push(`Video (${this.asset.metadata.duration.toFixed(1)}s)`)
        } else {
          info.push('Image')
        }
      } else {
        info.push("Blank")
      }
      return info.join(', ')
    },
  },
  methods: {
    async edit() {
      const selected = await ib.assetChooser({
        filter: ['image', 'video'],
        selected_asset_spec: this.asset && this.asset.id,
        no_node_assets: true,
      })
      if (selected) {
        this.$store.commit('assign_asset', {
          item_idx: this.item_idx,
          slot_idx: this.slot_idx,
          asset_id: selected.id,
        })
      }
    },
  }
})

Vue.component('playlist-item', {
  template: `
    <div class='item'>
      <content-slot
        :key='slot.id'
        :slot_idx='slot.idx'
        :item_idx='item_idx'
        :file='slot.file'
        :style="{width: slot.width + '%'}"
        :height='row_height'
        v-for='slot in slots'
      />
      <div class='dd-handle'></div>
      <div class='delete' @click='delete_item'>X</div>
      <div class='row'>
        <div class='col-xs-5'>
          <label class='field-label'>Play time (seconds):</label>
          <div class="input-group">
            <input class='form-control' type='number' min='2' placeholder='Play time' v-model.number.lazy='duration'/>
            <span class="input-group-btn" v-if='suggested_duration != null'>
              <button class="btn btn-default" type="button" @click='duration = suggested_duration'>
                Use suggested duration {{suggested_duration.toFixed(1)}}s
              </button>
            </span>
          </div>
        </div>
      </div>
    </div>
  `,
  props: ['item', 'item_idx'],
  computed: {
    slots() {
      let slots = []
      let size = this.$store.getters.size
      let offset = 0
      for (const slot_idx in this.item.content) {
        let slot = this.item.content[slot_idx]
        slots.push({
          idx: slot_idx,
          file: slot.file,
          width: 100 / size * slot.spread,
        })
      }
      return slots
    },
    row_height() {
      return 730 / this.$store.getters.size / this.$store.getters.screen_ratio
    },
    duration: {
      get() {
        return this.item.duration
      },
      set(v) {
        this.$store.commit('update_duration', {
          item_idx: this.item_idx,
          duration: v,
        })
      }
    },
    suggested_duration() {
      const assets = this.$store.state.assets
      let suggested_duration = null
      for (const item of this.item.content) {
        let asset = assets[item.file]
        if (asset && asset.filetype == "video") {
          if (suggested_duration == null) {
            suggested_duration = asset.metadata.duration
          } else {
            suggested_duration = Math.min(suggested_duration, asset.metadata.duration)
          }
        }
      }
      if (suggested_duration == this.duration)
        return null
      return suggested_duration
    },
  },
  methods: {
    delete_item() {
      this.$store.commit('delete_item', {
        item_idx: this.item_idx,
      })
    },
  }
})

Vue.component('playlist-editor', {
  template: `
    <div>
      <div class='alert alert-info' v-if='!$store.getters.has_assignments'>
        Configure a device assignment using the option below to configure a playlist.
      </div>
      <div class='alert alert-info' v-else-if='playlist.length == 0'>
        Empty playlist. Add items now to get started.
      </div>
      <draggable
        element='div'
        v-model="playlist"
        :options="dd_options"
      >
        <playlist-item
          :key='idx'
          :item='item'
          :item_idx='idx'
          v-for='item, idx in playlist'
        />
      </draggable>

      <div class='text-right' v-if='$store.getters.has_assignments'>
        Add new playlist item with layout
        <div class="btn-group">
          <button
            class="btn btn-default"
            @click="add_item(layout)"
            v-for='layout in $store.getters.layouts'
           >
            {{layout.join(':')}}
          </button>
        </div>
      </div>
    </div>
  `,
  data: () => ({
    dd_options: {
      forceFallback: isChrome,
      handle: '.dd-handle',
    },
  }),
  computed: {
    playlist: {
      get() {
        return this.$store.state.config.playlist
      },
      set(v) {
        this.$store.commit('update_playlist', v)
      }
    },
  },
  methods: {
    add_item(layout) {
      this.$store.commit('add_item', layout)
    },
  }
})

Vue.component('device-selector', {
  template: `
    <select v-model='serial' class='form-control'>
      <template v-for='device in available_devices'>
        <optgroup :label='device.text' v-if='device.group'>
          <option v-for='device in device.group' :value='device.serial'>
            {{device.text}}
          </option>
        </optgroup>
        <option v-else :value='device.serial'>
          {{device.text}}
        </option>
      </template>
    </select>
  `,
  props: ['selected_serial'],
  computed: {
    available_devices() {
      let devices = [{
        serial: "",
        text: "Unassigned",
      }]
      let assigned = []
      let unassigned = []
      for (let device of this.$store.state.devices) {
        let group = device.assigned ? assigned : unassigned
        group.push({
          serial: device.serial,
          text: `${device.description} (${device.serial})`,
        })
      }
      if (assigned.length > 0) {
        devices.push({
          text: "Assigned devices",
          group: assigned,
        })
      }
      if (unassigned.length > 0) {
        devices.push({
          text: "Other devices",
          group: unassigned,
        })
      }
      console.log(devices)
      return devices
    },
    serial: {
      get() {
        return this.selected_serial
      },
      set(v) {
        this.$emit('selected', v)
      }
    }
  }
})

Vue.component('assignment-editor', {
  template: `
    <div class='assignment'>
      Device Group {{assignment_idx+1}}<br/>
      <div class='delete' @click='delete_assignment'>X</div>
      <div
        class='device'
        v-for='device, device_idx in devices'
        :style='style(device)'
      >
        <device-selector
          :selected_serial='device.serial'
          @selected='set_serial(device_idx, $event)'
        />
      </div>
    </div>
  `,
  props: ['assignment', 'assignment_idx'],
  computed: {
    devices() {
      return this.assignment.devices
    },
  },
  methods: {
    style(device) {
      let slot_width = device.layout == "single" ? 1 : 2
      let width = this.$store.getters.size
      return {
        width: `${100 / width * slot_width}%`,
      }
    },
    delete_assignment() {
      this.$store.commit('delete_assignment', {
        assignment_idx: this.assignment_idx,
      })
    },
    set_serial(device_idx, serial) {
      this.$store.commit('update_serial', {
        assignment_idx: this.assignment_idx,
        device_idx, serial
      })
    }
  },
})

Vue.component('device-assignment', {
  template: `
    <div>
      <div class='alert alert-info' v-if='assignments.length == 0'>
        No screen groups. Create one now.
      </div>
      <assignment-editor
        :key='idx'
        :assignment='assignment'
        :assignment_idx='idx'
        v-for='assignment, idx in assignments'
        v-else
      />
      <div class='text-right'>
        <div class="btn-group">
          <button
            class="btn btn-default"
            @click='add_assignment(assignment.screens)'
            v-for='assignment in $store.getters.possible_assignments'
          >
            {{assignment.text}}
          </button>
        </div>
      </div>
    </div>
  `,
  computed: {
    assignments() {
      return this.$store.state.config.assignments
    }
  },
  methods: {
    add_assignment(screens) {
      this.$store.commit('add_assignment', screens)
    },
  }
})

Vue.component('playback-options', {
  template: `
    <div class='row'>
      <div class='col-xs-3'>
        <label>Display rotation</label>
        <select v-model='rotation' class='form-control'>
          <option value='0'>None</option>
          <option value='90'>90°</option>
          <option value='180'>180°</option>
          <option value='270'>270°</option>
        </select>
      </div>
      <div class='col-xs-3'>
        <label>Audio</label>
        <div class='checkbox'>
          <label>
            <input type='checkbox' v-model='audio'>
            Play audio for videos
          </label>
        </div>
      </div>
      <div class='col-xs-6'>
        <label>Synchronize changes</label>
        <select v-model='synced_changes' class='form-control'>
          <option value='0'>Update as fast as possible</option>
          <option value='45'>Wait around 60 seconds</option>
          <option value='105'>Wait around 2 minutes</option>
        </select>
      </div>
    </div>
  `,
  computed: {
    rotation: {
      get() {
        return this.$store.state.config.rotation
      },
      set(v) {
        this.$store.commit('set_config', {
          key: 'rotation',
          value: parseInt(v),
        })
      },
    },
    audio: {
      get() {
        return this.$store.state.config.audio
      },
      set(v) {
        console.log(v)
        this.$store.commit('set_config', {
          key: 'audio',
          value: v
        })
      },
    },
    synced_changes: {
      get() {
        return this.$store.state.config.synced_changes
      },
      set(v) {
        this.$store.commit('set_config', {
          key: 'synced_changes',
          value: parseInt(v),
        })
      },
    },
  }
})

Vue.component('config-ui', {
  template: `
    <div>
      <h2>Playlist</h2>
      <playlist-editor/>
      <div v-if='!show_advanced'>
        <a href='#' @click.stop='show_advanced = true'>Show advanced options..</a>
      </div>
      <template v-else>
        <br/>
        <h2>Device assignment</h2>
        <device-assignment/>
        <br/>
        <h2>Playback options</h2>
        <playback-options/>
      </template>
    </div>
  `,
  data: () => ({
    show_advanced: false,
  }),
  created() {
    this.show_advanced = !this.$store.getters.has_assignments
    console.log('advanced', this.show_advanced)
  }
})


// Set up the configuration app

ib.setDefaultStyle()

await ib.ready

if (!ib.assetChooser) {
  alert("Needs new setup page. Go to your account page and enable 'Use new configuration editor'")
}

ib.onAssetUpdate(() => {
  store.commit('assets_update', ib.assets)
})

store.commit('init', {
  assets: ib.assets,
  config: ib.config,
  devices: ib.devices,
})

new Vue({el: "#app", store})

store.subscribe((mutation, state) => {
  ib.setConfig(state.config)
})

})()
