-- License: BSD 2 clause (see LICENSE.txt)
gl.setup(NATIVE_WIDTH, NATIVE_HEIGHT)

util.no_globals()

-- Start preloading images/videos this many second
-- before they are displayed.
local PREPARE_TIME = 1 -- seconds

local SERIAL = sys.get_env "SERIAL"

-------------------------------------------------------------

local matrix = require "matrix2d"
local font = resource.load_font "silkscreen.ttf"
local white = resource.create_colored_texture(1,1,1,0.5)
local min, max = math.min, math.max
local audio = false
local empty_text = {
  main = "",
  sub = "",
}


local function round(v)
    return math.floor(v+.5)
end

-- patch in method for older info-beamer versions
if not matrix.apply_gl then
    matrix.apply_gl = function(m)
        return gl.modelMultiply(
            m.v11, m.v21, 0, m.v31,
            m.v12, m.v22, 0, m.v32,
            0,     0,     1,     0,
            m.v13, m.v23, 0, m.v33
        )
    end
end

local function Screen()
    local rotation = 0
    local screen_offset = 0
    local screen_spread = 1
    local forced_pos
    local is_portrait = false
    local transform

    local w, h = NATIVE_WIDTH, NATIVE_HEIGHT

    local function update_placement(new_rotation, new_offset, new_spread, new_forced_pos)
        rotation = new_rotation
        screen_offset = new_offset
        screen_spread = new_spread
        forced_pos = new_forced_pos

        is_portrait = rotation == 90 or rotation == 270

        gl.setup(w, h)

        transform = matrix.ident()

        if forced_pos then
            local forced_w, forced_h = forced_pos.x2 - forced_pos.x1,
                                       forced_pos.y2 - forced_pos.y1
            transform = transform *
                        matrix.scale(1 / w * forced_w, 1 / h * forced_h) *
                        matrix.trans(forced_pos.x1, forced_pos.y1)
        end

        if rotation == 0 then
            -- nothing to do
        elseif rotation == 90 then
            transform = transform *
                        matrix.trans(w, 0) *
                        matrix.rotate_deg(rotation)
        elseif rotation == 180 then
            transform = transform *
                        matrix.trans(w, h) *
                        matrix.rotate_deg(rotation)
        elseif rotation == 270 then
            transform = transform *
                        matrix.trans(0, h) *
                        matrix.rotate_deg(rotation)
        else
            return error(string.format("cannot rotate by %d degree", rotation))
        end

        if is_portrait then
            transform = transform *
                        matrix.trans(-h * screen_offset, 0)
        else
            transform = transform *
                        matrix.trans(-w * screen_offset, 0)
        end
    end

    local function draw_video(vid, x1, y1, x2, y2)
        local tx1, ty1 = transform(x1, y1)
        local tx2, ty2 = transform(x2, y2)
        local x1, y1, x2, y2 = round(math.min(tx1, tx2)),
                               round(math.min(ty1, ty2)),
                               round(math.max(tx1, tx2)),
                               round(math.max(ty1, ty2))
        return vid:place(x1, y1, x2, y2, rotation)
    end

    local function draw_image(img, x1, y1, x2, y2)
        return img:draw(x1, y1, x2, y2)
    end

    local function frame_setup()
        return matrix.apply_gl(transform)
    end

    local function screen_size()
        if is_portrait then
            return h, w
        else
            return w, h
        end
    end

    local function place(content_offset, content_spread)
        content_offset = content_offset or screen_offset
        content_spread = content_spread or screen_spread
        local w, h = screen_size()
        return w * content_offset, 0, w * (content_offset+content_spread), h
    end

    local function covers(left, right)
        return left < screen_offset + screen_spread and right > screen_offset
    end

    local function draw_debug()
        if forced_pos then
            local x1, y1, x2, y2 = place(screen_offset, screen_spread)
            draw_image(white, -10000, y1-5, 10000, y1-0)
            draw_image(white, -10000, y2+0, 10000, y2+5)
            draw_image(white, x1-5, -10000, x1-0, 10000)
            draw_image(white, x2+0, -10000, x2+5, 10000)
        end
    end

    update_placement(0, 0, 1)

    return {
        update_placement = update_placement;
        frame_setup = frame_setup;
        draw_image = draw_image;
        draw_video = draw_video;
        draw_debug = draw_debug;
        place = place;
        covers = covers;
    }
end

local screen = Screen()

local function Image(item)
    local obj

    local function prepare()
        if not obj then
            obj = resource.load_image{
                file = item.file:copy(),
            }
        end
    end

    local function tick(now)
        local state, w, h = obj:state()
        local x1, y1, x2, y2 = screen.place(item.offset, item.spread)
        screen.draw_image(obj, x1, y1, x2, y2)
    end

    local function stop()
        if obj then
            obj:dispose()
            obj = nil
        end
    end

    return {
        prepare = prepare,
        tick = tick,
        stop = stop,
    }
end

local function Video(item)
    local obj

    local function prepare()
        if not obj then
            obj = resource.load_video{
                file = item.file:copy(),
                raw = true,
                paused = true,
                audio = audio,
                looped = true,
            }
        end
    end

    local function tick(now)
        obj:start()
        local state, w, h = obj:state()

        if state ~= "loaded" and state ~= "finished" then
            print "not loaded yet :("
        else
            local x1, y1, x2, y2 = screen.place(item.offset, item.spread)
            obj:layer(1)
            screen.draw_video(obj, x1, y1, x2, y2)
        end
    end

    local function stop()
        if obj then
            obj:layer(-1)
            obj:dispose()
            obj = nil
        end
    end

    return {
        prepare = prepare,
        tick = tick,
        stop = stop,
    }
end

local function Empty()
    local function tick()
        local x1, y1, x2, y2 = screen.place()
        local cx = (x1+x2) / 2
        local cy = (y1+y2) / 2

        local text = empty_text.main
        local size = 48
        local w = font:width(text, size)
        font:write(cx - w/2, cy - size/2, text, size, 1,1,1,1)

        local text = empty_text.sub
        local size = 16
        local w = font:width(text, size)
        font:write(cx - w/2, cy - size/2+48, text, size, .5,.5,.5,1)
    end
    return {
        prepare = function() end,
        tick = tick,
        stop = function() end,
    }
end

local function Playlist()
    local total_duration, playlist
    local cur = Empty()
    local nxt
    local switch_time

    local function update(new_playlist)
        playlist = new_playlist
        total_duration = 0
        for _, item in ipairs(playlist) do
            total_duration = total_duration + item.duration
        end
    end

    local function setup_player(item)
        pp(item)
        return ({
            image = Image,
            video = Video,
            empty = Empty,
        })[item and item.filetype or "empty"](item)
    end

    local function get_next_item(now)
        if #playlist == 0 then
            return nil, now + 1
        end
        local epoch_offset = now % total_duration
        local epoch_start = now - epoch_offset
        local current_idx
        for idx = #playlist, 1, -1 do
            local item = playlist[idx]
            if item.epoch_offset <= epoch_offset then
                current_idx = idx
                break
            end
        end

        local next_item = playlist[current_idx % #playlist + 1]
        local wrap_around = current_idx == #playlist
        return next_item, epoch_start + next_item.epoch_offset + (
            wrap_around and total_duration or 0
        )
    end

    local function tick(now)
        if not nxt then
            print "deciding next item"
            local next_item
            next_item, switch_time = get_next_item(now)
            nxt = setup_player(next_item)
        end
        if switch_time - now < PREPARE_TIME then
            nxt.prepare()
        end
        if now >= switch_time then
            cur.stop()
            cur = nxt
            nxt = nil
        end
        cur.tick(now)
    end

    return {
        update = update;
        tick = tick;
    }
end

local playlist = Playlist()

local function apply_config(config)
    print "Applying new configuration"

    audio = config.audio

    local forced_pos
    if (config.x1 ~= 0 or config.y1 ~= 0 or
        config.x2 ~= 0 or config.y2 ~= 0)
    then
        forced_pos = {
            x1 = config.x1, y1 = config.y1,
            x2 = config.x2, y2 = config.y2,
        }
    else
        forced_pos = nil
    end

    local found_screen = false
    for _, assignment in ipairs(config.assignments) do
        local offset = 0
        for _, device in ipairs(assignment.devices) do
            local spread = device.layout == "single" and 1 or 2
            if device.serial == SERIAL then
                print("found my placement", offset, spread)
                screen.update_placement(config.rotation, offset, spread, forced_pos)
                found_screen = true
            end
            offset = offset + spread
        end
    end

    local new_playlist = {}
    local epoch_offset = 0
    local has_playlist = #config.playlist > 0
    for _, item in ipairs(config.playlist) do
        local offset = 0
        for _, content in ipairs(item.content) do
            local spread = content.spread
            if screen.covers(offset, offset + spread) then
                new_playlist[#new_playlist+1] = {
                    file = resource.open_file(content.file.asset_name),
                    filetype = content.file.type,
                    duration = item.duration,
                    epoch_offset = epoch_offset,
                    offset = offset,
                    spread = spread
                }
                break
            end
            offset = offset + spread
        end
        epoch_offset = epoch_offset + item.duration
    end
    playlist.update(new_playlist)

    if not found_screen then
      empty_text = {
        main = "Not assigned to this setup",
        sub = "Use 'Device Assignment' to add this device to this setup"
      }
    elseif not has_playlist then
      empty_text = {
        main = "No playlist configured",
        sub = "Add items to the playlist of this setup"
      }
    else
      empty_text = {
        main = "Waiting for sync",
        sub = "Waiting for correct system time and item start"
      }
    end
end


do
    local config_switch, config
    util.json_watch("config.json", function(new_config)
        if new_config.synced_changes == 0 or not config then
            config_switch = os.time()
        else
            config_switch = new_config.__metadata.sync_ts + config.synced_changes
        end
        config = new_config
    end)

    node.event("tick", function()
        if config_switch and os.time() >= config_switch then
            config_switch = nil
            apply_config(config)
        end
    end)
end

function node.render()
    screen.frame_setup()
    playlist.tick(os.time())
    screen.draw_debug()
end
