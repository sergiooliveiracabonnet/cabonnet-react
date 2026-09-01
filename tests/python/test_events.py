import asyncio
import queue


def test_sse_stream_emits_initial_frame_without_waiting():
    from cabonnet.app import _sse_stream

    stream = _sse_stream(queue.Queue())

    async def first_frame():
        try:
            return await anext(stream)
        finally:
            await stream.aclose()

    assert asyncio.run(first_frame()) == ": connected\n\n"
